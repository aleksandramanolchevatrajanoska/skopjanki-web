import { maybeRunLifecycle } from "@/lib/services/lazy";
import { notFound, redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { attempt } from "@/lib/act";
import { fmtRange, loadEventCards } from "@/lib/views";
import { formatDateTime } from "@/lib/time";
import { lockTime, AppError } from "@/lib/services/common";
import { reserve, cancelReservation, acceptOffer } from "@/lib/services/reservations";
import { applyCaptain } from "@/lib/services/captains";
import { saveAttendance, markDebtPaid } from "@/lib/services/attendance";
import { pricesFor } from "@/lib/pricing";
import { fusionCheckout } from "@/lib/stripe";
import { Flash } from "@/components/Flash";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

async function goPay(reservationId: string, eventId: string, amount: number) {
  const user = await requireApproved();
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  let url: string | null = null;
  try {
    url = await fusionCheckout(reservationId, event, user, amount);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/events/${eventId}?err=${e.code}`);
    throw e;
  }
  redirect(url);
}

async function doReserve(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  let r: Awaited<ReturnType<typeof reserve>>;
  try {
    r = await reserve(prisma, user.id, id);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/events/${id}?err=${e.code}`);
    throw e;
  }
  if (r.status === "PENDING_PAYMENT" && r.amountDue) await goPay(r.reservationId, id, r.amountDue);
  redirect(`/app/events/${id}?ok=${r.status === "WAITLIST" ? "onWaitlist" : "youreIn"}`);
}

async function doPay(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  const r = await prisma.reservation.findUnique({ where: { eventId_userId: { eventId: id, userId: user.id } }, include: { event: true } });
  if (!r || r.status !== "PENDING_PAYMENT" || !r.holdUntil || r.holdUntil < new Date()) redirect(`/app/events/${id}?err=OFFER_EXPIRED`);
  const p = pricesFor(r.event, 0, 0)!;
  await goPay(r.id, id, (r.isMember ? p.member : p.nonMember) - r.creditUsed);
}

async function doCancel(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}`, () => cancelReservation(prisma, user.id, id));
}

async function doAccept(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  let r: Awaited<ReturnType<typeof acceptOffer>>;
  try {
    r = await acceptOffer(prisma, user.id, id);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/events/${id}?err=${e.code}`);
    throw e;
  }
  if (r.status === "PENDING_PAYMENT" && r.amountDue) await goPay(r.reservationId, id, r.amountDue);
  redirect(`/app/events/${id}?ok=youreIn`);
}

async function doCaptain(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}`, () => applyCaptain(prisma, user.id, id), "captainApplied");
}

async function doAttendance(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  const came = form.getAll("came").map(String);
  await attempt(`/app/events/${id}`, () => saveAttendance(prisma, user.id, id, came));
}

async function doDebtPaid(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}`, () => markDebtPaid(prisma, user.id, String(form.get("debtId"))));
}

export default async function EventPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  await maybeRunLifecycle();
  const now = new Date();
  const [card] = await loadEventCards({ id }, user.id);
  if (!card) notFound();
  if (card.status === "PENDING" && card.createdById !== user.id && !user.isOwner) notFound();
  const e = card;
  const isCaptain = e.captainId === user.id;
  const canManage = isCaptain || user.isOwner;
  const late = now >= lockTime(e);
  const mine = e.mine;
  const membersOnlyNow = !member && e.earlyUntil && now < e.earlyUntil;
  const myApp = await prisma.captainApplication.findUnique({ where: { eventId_userId: { eventId: id, userId: user.id } } });

  const people = await prisma.reservation.findMany({
    where: { eventId: id, status: { in: ["CONFIRMED", "WAITLIST", "OFFERED"] } },
    include: { user: { select: { id: true, name: true, instagram: true } } },
    orderBy: { createdAt: "asc" },
  });
  const confirmed = people.filter((p) => p.status === "CONFIRMED");

  // Captain's corner data
  let debtsToCollect: { id: string; amount: number; user: { name: string } }[] = [];
  let finalPrices: { nonMember: number; member: number } | null = null;
  if (canManage && e.kind !== "FUSION") {
    debtsToCollect = await prisma.debt.findMany({
      where: { paidAt: null, waivedAt: null, userId: { in: confirmed.map((c) => c.userId) } },
      include: { user: { select: { name: true } } },
    });
    if (e.attendanceClosedAt) {
      const came = confirmed.filter((c) => c.attended && c.userId !== e.captainId);
      finalPrices = pricesFor(e, came.filter((c) => !c.isMember).length, came.filter((c) => c.isMember).length);
    }
  }
  const myDebts = await prisma.debt.findMany({ where: { userId: user.id, paidAt: null, waivedAt: null } });
  const owed = myDebts.reduce((s, d) => s + d.amount, 0);
  const myPrice = e.range ? (mine?.isMember ?? member ? e.range.member : e.range.nonMember) : null;
  const img = e.kind === "FUSION" ? (/yoga|asana|brunch/i.test(e.title) ? "/img/asanas.jpg" : /tennis|sip|wine/i.test(e.title) ? "/img/sip.jpg" : null) : null;

  return (
    <article>
      <p><a href="/app" className="meta">← {t.events}</a></p>
      <Flash sp={sp} locale={locale} />
      {sp.ok === "paid" && <div className="notice ok">{t.payPending}</div>}
      <div className="two" style={{ alignItems: "start", marginTop: 12 }}>
        <div className="stack">
          <div>
            <span className={`tag ${e.kind === "FUSION" ? "p" : ""}`}>{t.kinds[e.kind]}</span>
            {e.status === "PENDING" && <span className="tag">{t.pendingApproval}</span>}
            {e.status === "CANCELLED" && <span className="tag">✕ {e.cancelReason}</span>}
          </div>
          <h1>{e.title}</h1>
          <p className="meta">{formatDateTime(e.startsAt, locale)}</p>
          {(e.partner || e.place) && (
            <p>
              {e.partner?.name ?? e.place}
              {e.partner?.address && <span className="meta"> · {e.partner.address}</span>}
              {e.partner?.mapsUrl && <> · <a href={e.partner.mapsUrl}>Maps</a></>}
            </p>
          )}
          {e.description && <p style={{ whiteSpace: "pre-line" }}>{e.description}</p>}
          {e.captain && <p>{t.captain}: <strong>{e.captain.name}</strong> <span className="meta">({t.captainFree})</span></p>}
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (e.confirmed / e.maxSpots) * 100)}%` }} /></div>
          <p className="meta">{e.confirmed} / {e.maxSpots} {t.going} · min {e.minSpots}{e.waiting ? ` · ${e.waiting} ${t.waitlist}` : ""}</p>
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="polaroid" style={{ maxWidth: 280 }} />
          )}
        </div>

        <div className="card stack">
          {e.range && (
            <div>
              <p className="label">{e.lockedAt ? t.priceLocked : t.price}</p>
              <p className="price">{fmtRange(myPrice!)} <small className="meta">MKD</small></p>
              <p className="meta">
                {t.nonMember}: {fmtRange(e.range.nonMember)} · {t.member}: {fmtRange(e.range.member)}
              </p>
              <p className="meta">
                {e.kind === "FUSION" ? "Stripe" : t.priceCash}
                {!e.range.fixed && !e.lockedAt ? ` · ${t.priceRange}` : ""}
              </p>
              {e.kind !== "FUSION" && owed > 0 && (
                <p className="notice">{t.yourDebt}: <strong>{owed} MKD</strong></p>
              )}
            </div>
          )}

          {e.status === "APPROVED" && e.startsAt > now && (
            <div className="stack">
              {!mine && (
                <form action={doReserve}>
                  <input type="hidden" name="eventId" value={e.id} />
                  {membersOnlyNow ? (
                    <>
                      <p className="notice">{t.membersFirstUntil} {formatDateTime(e.earlyUntil!, locale)}.</p>
                      <a className="btn pink" href="/app/membership">{t.becomeMember}</a>
                    </>
                  ) : (
                    <button className="btn pink" type="submit">
                      {e.confirmed >= e.maxSpots ? t.joinWaitlist : e.kind === "FUSION" ? t.reservePay : t.reserve}
                    </button>
                  )}
                </form>
              )}
              {mine?.status === "CONFIRMED" && <p className="notice ok">{t.youreIn}</p>}
              {mine?.status === "WAITLIST" && <p className="notice">{t.onWaitlist}</p>}
              {mine?.status === "PENDING_PAYMENT" && (
                <form action={doPay}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <p className="notice">{t.payPending}</p>
                  <button className="btn pink" type="submit">{t.payNow}</button>
                </form>
              )}
              {mine?.status === "OFFERED" && (
                <div>
                  <p className="notice ok">{t.offered}</p>
                  <div className="row">
                    <form action={doAccept}><input type="hidden" name="eventId" value={e.id} /><button className="btn pink" type="submit">{t.confirmPlace}</button></form>
                    <form action={doCancel}><input type="hidden" name="eventId" value={e.id} /><button className="btn ghost" type="submit">{t.declinePlace}</button></form>
                  </div>
                </div>
              )}
              {mine && mine.status !== "OFFERED" && !isCaptain && (
                <form action={doCancel}>
                  <input type="hidden" name="eventId" value={e.id} />
                  {late && mine.status === "CONFIRMED" && e.kind !== "FUSION" && <p className="meta">{t.cancelLateWarn}</p>}
                  <button className="btn ghost sm" type="submit">{t.cancel}</button>
                </form>
              )}
              {(e.kind === "WEEKLY" || e.kind === "SPECIAL") && !e.captainId && member && (
                myApp?.status === "PENDING" ? (
                  <p className="meta">{t.captainApplied}</p>
                ) : (
                  <form action={doCaptain}>
                    <input type="hidden" name="eventId" value={e.id} />
                    <button className="btn ghost sm" type="submit">♛ {t.applyCaptain}</button>
                  </form>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <section style={{ marginTop: 28 }}>
        <h3>{t.whoIsGoing} ({confirmed.length})</h3>
        <p>{confirmed.map((p) => p.user.name + (p.userId === e.captainId ? " ♛" : "")).join(", ") || "–"}</p>
      </section>

      {canManage && e.kind !== "FUSION" && e.status === "APPROVED" && (
        <section className="card" style={{ marginTop: 28 }}>
          <h2>♛ {t.captainBox}</h2>
          <form action={doAttendance}>
            <input type="hidden" name="eventId" value={e.id} />
            <p className="label" style={{ marginTop: 12 }}>{t.markAttendance}</p>
            {confirmed.map((p) => (
              <label key={p.id} style={{ fontWeight: 400 }} className="row">
                <input type="checkbox" name="came" value={p.userId} defaultChecked={p.attended ?? true} disabled={p.userId === e.captainId} />
                {p.user.name} <span className="meta">{p.isMember ? t.member : t.nonMember}</span>
              </label>
            ))}
            <p style={{ marginTop: 10 }}><button className="btn sm" type="submit">{t.saveAttendance}</button></p>
          </form>
          {finalPrices && (
            <p className="notice ok">{t.finalPrices}: {t.nonMember} <strong>{finalPrices.nonMember} MKD</strong> · {t.member} <strong>{finalPrices.member} MKD</strong></p>
          )}
          {debtsToCollect.length > 0 && (
            <>
              <p className="label" style={{ marginTop: 16 }}>{t.debtsToCollect}</p>
              {debtsToCollect.map((d) => (
                <form key={d.id} action={doDebtPaid} className="row" style={{ marginTop: 6 }}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <input type="hidden" name="debtId" value={d.id} />
                  <span>{d.user.name}: <strong>{d.amount} MKD</strong></span>
                  <button className="btn sm ghost" type="submit">{t.markPaid}</button>
                </form>
              ))}
            </>
          )}
        </section>
      )}
    </article>
  );
}
