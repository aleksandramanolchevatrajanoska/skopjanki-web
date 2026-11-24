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
import { PartnerCard } from "@/components/PartnerCard";
import { canEditEvent } from "@/lib/services/events";
import { appUrl } from "@/lib/email";
import { googleCalendarUrl } from "@/lib/calendar";
import { canAddPhotos, removePhoto } from "@/lib/services/club";
import { MediaCarousel, PhotoUploader, ShareButton, type MediaSlide } from "@/components/Interactive";
import { toEmbed } from "@/lib/embeds";

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

/** One click: take a seat (if she has none yet) and ask to be the captain. */
async function doJoinAsCaptain(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}`, async () => {
    const mine = await prisma.reservation.findUnique({ where: { eventId_userId: { eventId: id, userId: user.id } } });
    if (!mine || mine.status === "CANCELLED") await reserve(prisma, user.id, id);
    await applyCaptain(prisma, user.id, id);
  }, "youreIn");
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

async function doRemovePhoto(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#moments`, () => removePhoto(prisma, user.id, String(form.get("photoId"))));
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
  const [photos, mayAddPhotos] = await Promise.all([
    prisma.photo.findMany({ where: { eventId: id }, select: { id: true, userId: true, user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    canAddPhotos(prisma, user.id, id, now),
  ]);
  const placeText = [e.partner?.name ?? e.place, e.partner?.address].filter(Boolean).join(", ");
  const calUrl = googleCalendarUrl({ ...e, place: placeText }, appUrl(`/app/events/${e.id}`));
  const [hasPoster, host] = await Promise.all([
    prisma.eventPoster.count({ where: { eventId: id } }).then((n) => n > 0),
    e.kind === "MEMBER_PLAN" ? prisma.user.findUnique({ where: { id: e.createdById }, select: { name: true } }) : null,
  ]);
  const img = hasPoster
    ? `/posters/${e.id}`
    : e.imageUrl
    ? e.imageUrl
    : e.kind === "FUSION" ? (/yoga|asana|brunch/i.test(e.title) ? "/img/asanas.jpg" : /tennis|sip|wine/i.test(e.title) ? "/img/sip.jpg" : null) : null;
  const agenda = Array.isArray(e.agenda) ? (e.agenda as [string, string][]) : [];
  const embeds = [...e.videoUrls, ...(e.instagramUrl && !e.videoUrls.includes(e.instagramUrl) ? [e.instagramUrl] : [])]
    .map((u) => toEmbed(u))
    .filter((x): x is NonNullable<ReturnType<typeof toEmbed>> => Boolean(x));
  const slides: MediaSlide[] = [
    ...(img ? [{ type: "image" as const, src: img, alt: `${e.title} poster` }] : []),
    ...photos.map((ph) => ({ type: "image" as const, src: `/photos/${ph.id}`, alt: `${e.title}, ${ph.user.name}` })),
    ...embeds.map((v) => ({ type: "embed" as const, src: v.embedUrl, title: `${e.title} · ${v.kind}`, portrait: v.portrait })),
  ];

  return (
    <article>
      <p><a href="/app" className="meta">← {t.events}</a></p>
      <Flash sp={sp} locale={locale} />
      {sp.ok === "paid" && <div className="notice ok">{t.payPending}</div>}
      {/* poster, photos, videos and the Instagram post in one carousel */}
      <div className="two" style={{ alignItems: "start", marginTop: 12 }}>
        <div className="stack">
          <div>
            <span className={`tag ${e.kind === "FUSION" ? "p" : ""}`}>{t.kinds[e.kind]}</span>
            {e.sport && <span className="tag c">{e.sport} · {e.level ? t.levels[e.level] ?? e.level : t.allLevels}</span>}
            {e.vibe && <span className="tag">{t.vibes[e.vibe]}</span>}
            {e.status === "PENDING" && <span className="tag">{t.pendingApproval}</span>}
            {e.status === "CANCELLED" && <span className="tag">✕ {e.cancelReason}</span>}
          </div>
          <div className="between">
            <h1>{e.title}</h1>
            {canEditEvent(user, e) && e.status !== "CANCELLED" && <a className="btn sm ghost" href={`/app/events/${e.id}/edit`}>✎ {t.editEvent}</a>}
          </div>
          {e.tagline && <p className="tagline">{e.tagline}</p>}
          <p className="meta">{formatDateTime(e.startsAt, locale)}</p>
          <p className="meta">{host ? `${t.initiator}: ${host.name} (${t.captainFree})` : t.hostedBySkopjanki}</p>
          {(e.partner || e.place) && (
            <p>
              {e.partner?.name ?? e.place}
              {e.partner?.address && <span className="meta"> · {e.partner.address}</span>}
              {e.partner?.mapsUrl && <> · <a href={e.partner.mapsUrl}>Maps</a></>}
            </p>
          )}
          {e.description && <p style={{ whiteSpace: "pre-line" }}>{e.description}</p>}
          {agenda.length > 0 && (
            <div>
              <p className="label">{t.agendaTitle}</p>
              <ul className="agenda">
                {agenda.map(([time, label], i) => <li key={i}>{time && <strong>{time}</strong>} {label}</li>)}
              </ul>
            </div>
          )}
          {e.captain && <p>{t.captain}: <strong>{e.captain.name}</strong> <span className="meta">({t.captainFree})</span></p>}
          <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (e.confirmed / e.maxSpots) * 100)}%` }} /></div>
          <p className="meta">{e.confirmed} / {e.maxSpots} {t.going} · min {e.minSpots}{e.waiting ? ` · ${e.waiting} ${t.waitlist}` : ""}</p>
          {slides.length > 0 && <MediaCarousel slides={slides} labels={{ prev: t.prevSlide, next: t.nextSlide }} />}
          {e.instagramUrl && (
            <p><a className="btn sm ghost" href={e.instagramUrl} target="_blank" rel="noopener noreferrer">↗ {t.seeOnInstagram}</a></p>
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
              {mine?.status === "CONFIRMED" && (
                <div>
                  <p className="notice ok">{t.youreIn}</p>
                  <p className="label">{t.addToCalendar}</p>
                  <p className="row">
                    <a className="btn sm ghost" href={calUrl} target="_blank" rel="noopener noreferrer">{t.googleCalendar}</a>
                    <a className="btn sm ghost" href={`/app/events/${e.id}/ics`}>{t.appleCalendar}</a>
                  </p>
                </div>
              )}
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
              {(e.kind === "WEEKLY" || e.kind === "SPECIAL") && !e.captainId && (
                <div className="captain-box">
                  <p className="label">♛ {t.captainTitle}</p>
                  <p className="meta">{t.captainPitch}</p>
                  {!member ? (
                    <p className="meta">{t.captainMembersOnly} <a href="/app/membership">{t.becomeMember}</a></p>
                  ) : myApp?.status === "PENDING" ? (
                    <p className="notice">{t.captainApplied}</p>
                  ) : (
                    <form action={doJoinAsCaptain}>
                      <input type="hidden" name="eventId" value={e.id} />
                      <button className="btn" type="submit">♛ {mine ? t.applyCaptain : t.joinAsCaptain}</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
          {e.status === "APPROVED" && (
            <ShareButton url={`/app/events/${e.id}`} title={`Skopjanki: ${e.title}`} labels={{ share: t.share, copyLink: t.copyLink, copied: t.copied }} />
          )}
        </div>
      </div>

      {(photos.length > 0 || mayAddPhotos) && (
        <section id="moments" style={{ marginTop: 28 }}>
          <div className="between">
            <h2>{e.startsAt < now ? t.momentsTitle : t.photosAndVideos}</h2>
            {mayAddPhotos && <PhotoUploader eventId={e.id} labels={{ addPhotos: t.addPhotos, uploading: t.uploading, uploadFailed: t.uploadFailed }} />}
          </div>
          {mayAddPhotos && photos.length === 0 && <p className="meta">{t.addPhotosHint}</p>}
          <div className="photos">
            {photos.map((p) => (
              <figure key={p.id}>
                <a href={`/photos/${p.id}`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/photos/${p.id}`} alt={`${e.title}, ${p.user.name}`} loading="lazy" />
                </a>
                <figcaption className="between">
                  <span className="meta">{p.user.name}</span>
                  {(p.userId === user.id || user.isOwner) && (
                    <form action={doRemovePhoto}>
                      <input type="hidden" name="eventId" value={e.id} />
                      <input type="hidden" name="photoId" value={p.id} />
                      <button className="btn sm ghost" type="submit">{t.removePhoto}</button>
                    </form>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section style={{ marginTop: 28 }}>
        <h3>{t.whoIsGoing} ({confirmed.length})</h3>
        <p>{confirmed.map((p) => p.user.name + (p.userId === e.captainId ? " ♛" : "")).join(", ") || "–"}</p>
      </section>

      {e.partner && (
        <section style={{ marginTop: 28 }}>
          <h3>{t.whereItHappens}</h3>
          <div className="grid" style={{ maxWidth: 420 }}><PartnerCard p={e.partner} locale={locale} member={member} /></div>
        </section>
      )}

      {canManage && e.kind !== "FUSION" && e.status === "APPROVED" && confirmed.length > 0 &&
        now.getTime() >= e.startsAt.getTime() - 3 * 3600_000 && now.getTime() <= e.startsAt.getTime() + 7 * 86400_000 && (
        <section className="card" style={{ marginTop: 28 }}>
          <h2>♛ {t.captainBox}</h2>
          <p className="meta">{t.captainBoxHint}</p>
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
