import { maybeRunLifecycle } from "@/lib/services/lazy";
import { notFound, redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { attempt, str } from "@/lib/act";
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
import { markCommissionPaid, workshopCommission } from "@/lib/services/workshops";
import { addGuest, removeGuest, addNote, deleteNote, notesFor, canWriteNote, NOTE_MAX, addParticipant, removeParticipant } from "@/lib/services/eventdesk";

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

async function doCommissionPaid(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  if (!user.isOwner) redirect(`/app/events/${id}?err=FORBIDDEN`);
  await attempt(`/app/events/${id}#desk`, () => markCommissionPaid(prisma, id, form.get("paid") === "1"));
}

async function doAddParticipant(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#desk`, () => addParticipant(prisma, user.id, id, String(form.get("userId"))));
}

async function doRemoveParticipant(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#desk`, () => removeParticipant(prisma, user.id, id, String(form.get("userId"))));
}

async function doAddGuest(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#desk`, () =>
    addGuest(prisma, user.id, id, { name: str(form.get("name")), phone: str(form.get("phone")), isMember: form.get("isMember") === "1" }),
  );
}

async function doRemoveGuest(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#desk`, () => removeGuest(prisma, user.id, String(form.get("guestId"))));
}

async function doAddNote(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  const replyTo = str(form.get("replyTo")) || null;
  await attempt(`/app/events/${id}#notes`, () => addNote(prisma, user.id, id, str(form.get("body")), replyTo));
}

async function doDeleteNote(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("eventId"));
  await attempt(`/app/events/${id}#notes`, () => deleteNote(prisma, user.id, String(form.get("noteId"))));
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
  const [guests, mayNote] = await Promise.all([
    prisma.eventGuest.findMany({ where: { eventId: id }, orderBy: { createdAt: "asc" } }),
    canWriteNote(prisma, user.id, id),
  ]);
  const notes = mayNote || canManage ? await notesFor(prisma, user.id, id) : [];

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
      const g = guests.filter((x) => x.attended);
      finalPrices = pricesFor(e, came.filter((c) => !c.isMember).length + g.filter((x) => !x.isMember).length, came.filter((c) => c.isMember).length + g.filter((x) => x.isMember).length);
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
  const partnerLogo = e.partner ? await prisma.partnerLogo.findUnique({ where: { partnerId: e.partner.id }, select: { updatedAt: true } }) : null;
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

  const money = canManage && e.workshop ? await workshopCommission(prisma, id) : null;
  const clubGirls = canManage
    ? await prisma.user.findMany({
        where: { status: "APPROVED", id: { notIn: confirmed.map((c) => c.userId) } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const attendanceOpen = now.getTime() >= e.startsAt.getTime() - 3 * 3600_000 && now.getTime() <= e.startsAt.getTime() + 7 * 86400_000;
  const goingCount = confirmed.length + guests.length;

  return (
    <article className="event-page">
      <p><a href={e.kind === "FUSION" ? "/app?kind=fusion" : "/app?kind=weekly"} className="meta">← {e.kind === "FUSION" ? t.fusionTab : t.playTab}</a></p>
      <Flash sp={sp} locale={locale} />
      {sp.ok === "paid" && <div className="notice ok">{t.payPending}</div>}

      <header className="ev-head">
        <div>
          <span className={`tag ${e.kind === "FUSION" ? "p" : e.workshop ? "c" : ""}`}>{e.workshop ? t.workshopTag : t.kinds[e.kind]}</span>
          {e.sport && <span className="tag c">{e.sport} · {e.level ? t.levels[e.level] ?? e.level : t.allLevels}</span>}
          {e.vibe && <span className="tag">{t.vibes[e.vibe]}</span>}
          {e.status === "PENDING" && <span className="tag">{t.pendingApproval}</span>}
          {e.status === "CANCELLED" && <span className="tag">✕ {e.cancelReason}</span>}
        </div>
        <h1>{e.title}</h1>
        {e.tagline && <p className="tagline">{e.tagline}</p>}
        <div className="ev-actions">
          {canEditEvent(user, e) && e.status !== "CANCELLED" && <a className="btn sm ghost" href={`/app/events/${e.id}/edit`}>✎ {t.editEvent}</a>}
          {e.instagramUrl && <a className="btn sm ghost" href={e.instagramUrl} target="_blank" rel="noopener noreferrer">↗ {t.seeOnInstagram}</a>}
          {e.status === "APPROVED" && (
            <ShareButton url={`/app/events/${e.id}`} title={`Skopjanki: ${e.title}`} labels={{ share: t.share, copyLink: t.copyLink, copied: t.copied }} />
          )}
        </div>
      </header>

      <div className="ev-grid">
        <div className="stack">
          {slides.length > 0 && <MediaCarousel slides={slides} labels={{ prev: t.prevSlide, next: t.nextSlide }} />}
          {e.description && <p className="ev-desc">{e.description}</p>}
          {agenda.length > 0 && (
            <div>
              <p className="label">{t.agendaTitle}</p>
              <ul className="agenda">
                {agenda.map(([time, label], i) => <li key={i}>{time && <strong>{time}</strong>} {label}</li>)}
              </ul>
            </div>
          )}
        </div>

        <aside className="card stack ev-side">
          <div className="ev-facts">
            <p><span className="ev-ic" aria-hidden="true">◷</span>{formatDateTime(e.startsAt, locale)}</p>
            {(e.partner || e.place) && (
              <p>
                <span className="ev-ic" aria-hidden="true">⌖</span>
                <span>
                  {e.partner?.name ?? e.place}
                  {e.partner?.address && <span className="meta"> · {e.partner.address}</span>}
                  {e.partner?.mapsUrl && <> · <a href={e.partner.mapsUrl}>Maps</a></>}
                </span>
              </p>
            )}
            <p><span className="ev-ic" aria-hidden="true">✦</span><span className="meta">{host ? `${t.initiator}: ${host.name} (${t.captainFree})` : t.hostedBySkopjanki}</span></p>
            {e.captain && <p><span className="ev-ic" aria-hidden="true">♛</span><span>{t.captain}: <strong>{e.captain.name}</strong> <span className="meta">({t.captainFree})</span></span></p>}
          </div>
          <div>
            <div className="bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (goingCount / e.maxSpots) * 100)}%` }} /></div>
            <p className="meta" style={{ marginTop: 6 }}>{goingCount} / {e.maxSpots} {t.going} · min {e.minSpots}{e.waiting ? ` · ${e.waiting} ${t.waitlist}` : ""}</p>
          </div>

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
                    <button className="btn pink wide" type="submit">
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
        </aside>
      </div>

      <section className="ev-section">
        <h2>{t.whoIsGoing} <span className="meta">({goingCount})</span></h2>
        {goingCount === 0 ? (
          <p className="meta">–</p>
        ) : (
          <ul className="people">
            {confirmed.map((p) => (
              <li key={p.id}>
                <span className="avatar" aria-hidden="true">{p.user.name.slice(0, 1).toUpperCase()}</span>
                {p.user.name}{p.userId === e.captainId ? " ♛" : ""}
              </li>
            ))}
            {guests.map((g) => (
              <li key={g.id}>
                <span className="avatar" aria-hidden="true">{g.name.slice(0, 1).toUpperCase()}</span>
                {g.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mayNote || notes.length > 0 ? (
        <section className="ev-section" id="notes">
          <h2>{t.notesTitle}</h2>
          <p className="meta">{t.notesHint}</p>
          {notes.length === 0 ? (
            <p className="meta">{t.noNotes}</p>
          ) : (
            <ul className="notes">
              {notes.filter((n) => !n.parentId).map((n) => {
                const replies = notes.filter((r) => r.parentId === n.id);
                const one = (m: (typeof notes)[number]) => (
                  <>
                    <div className="between">
                      <strong>{m.user.name}</strong>
                      <span className="meta">{formatDateTime(m.createdAt, locale)}</span>
                    </div>
                    <p>{m.body}</p>
                  </>
                );
                const del = (m: (typeof notes)[number]) =>
                  (m.userId === user.id || user.isOwner) && (
                    <form action={doDeleteNote}>
                      <input type="hidden" name="eventId" value={e.id} />
                      <input type="hidden" name="noteId" value={m.id} />
                      <button className="btn sm ghost" type="submit">{t.remove}</button>
                    </form>
                  );
                return (
                  <li key={n.id}>
                    {one(n)}
                    <div className="row note-actions">{del(n)}</div>
                    {replies.length > 0 && (
                      <ul className="replies">
                        {replies.map((r) => (
                          <li key={r.id}>
                            {one(r)}
                            <div className="row note-actions">{del(r)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {mayNote && (
                      <details className="reply-box">
                        <summary className="btn sm ghost">↩ {t.replyButton}{replies.length > 0 ? ` (${replies.length})` : ""}</summary>
                        <form action={doAddNote}>
                          <input type="hidden" name="eventId" value={e.id} />
                          <input type="hidden" name="replyTo" value={n.id} />
                          <textarea name="body" rows={2} required maxLength={NOTE_MAX} aria-label={`${t.replyButton}: ${n.user.name}`} placeholder={`${t.replyTo} ${n.user.name}…`} />
                          <p style={{ marginTop: 6 }}><button className="btn sm" type="submit">{t.sendNote}</button></p>
                        </form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {mayNote && (
            <form action={doAddNote} className="note-form">
              <input type="hidden" name="eventId" value={e.id} />
              <textarea name="body" rows={3} required maxLength={NOTE_MAX} placeholder={t.notePlaceholder} aria-label={t.notesTitle} />
              <p style={{ marginTop: 8 }}><button className="btn sm" type="submit">{t.sendNote}</button></p>
            </form>
          )}
        </section>
      ) : e.status === "APPROVED" ? (
        <section className="ev-section" id="notes">
          <h2>{t.notesTitle}</h2>
          <p className="meta">{t.chatLocked}</p>
        </section>
      ) : null}

      {canManage && e.status === "APPROVED" && (
        <section className="card ev-section desk" id="desk">
          <h2>♛ {t.captainBox}</h2>
          <p className="meta">{t.captainDeskHint}</p>

          {money && (
            <div className="workshop-money">
              <p className="label">{t.workshopBoxTitle}</p>
              <div className="row" style={{ gap: 28 }}>
                <div><b>{money.collected} MKD</b><span className="meta">{t.workshopCollected} · {money.girls} {t.going}</span></div>
                <div><b>{money.owed} MKD</b><span className="meta">{t.workshopOwed} ({money.pct}%)</span></div>
              </div>
              {!money.final && <p className="meta">{t.workshopEstimate}</p>}
              {money.paidAt && <p className="notice ok">{t.workshopPaid} · {formatDateTime(money.paidAt, locale)}</p>}
              {user.isOwner && (
                <form action={doCommissionPaid}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <input type="hidden" name="paid" value={money.paidAt ? "0" : "1"} />
                  <button className="btn sm ghost" type="submit">{money.paidAt ? t.workshopMarkUnpaid : t.workshopMarkPaid}</button>
                </form>
              )}
            </div>
          )}

          <div className="desk-grid">
            <div>
              <h3>{t.participantsTitle} ({goingCount})</h3>
              <ul className="desk-list">
                {confirmed.map((p) => (
                  <li key={p.id}>
                    <span>{p.user.name}{p.userId === e.captainId ? " ♛" : ""} <span className="meta">· {p.isMember ? t.member : t.nonMember}</span></span>
                    {p.userId !== e.captainId && (
                      <form action={doRemoveParticipant}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="userId" value={p.userId} />
                        <button className="btn sm ghost" type="submit">{t.remove}</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {clubGirls.length > 0 && (
                <form action={doAddParticipant} className="row" style={{ margin: "8px 0 16px" }}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <label htmlFor="add-girl" className="sr-only">{t.addFromClub}</label>
                  <select id="add-girl" name="userId" required defaultValue="" aria-label={t.addFromClub}>
                    <option value="" disabled>{t.addFromClubPick}</option>
                    {clubGirls.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <button className="btn sm" type="submit">+ {t.addFromClubButton}</button>
                </form>
              )}
              {e.kind !== "FUSION" && attendanceOpen ? (
                <form action={doAttendance}>
                  <input type="hidden" name="eventId" value={e.id} />
                  <p className="meta">{t.captainBoxHint}</p>
                  <p className="label" style={{ marginTop: 12 }}>{t.markAttendance}</p>
                  {confirmed.map((p) => (
                    <label key={p.id} style={{ fontWeight: 400 }} className="row">
                      <input type="checkbox" name="came" value={p.userId} defaultChecked={p.attended ?? true} disabled={p.userId === e.captainId} />
                      {p.user.name} <span className="meta">{p.isMember ? t.member : t.nonMember}</span>
                    </label>
                  ))}
                  {guests.map((g) => (
                    <label key={g.id} style={{ fontWeight: 400 }} className="row">
                      <input type="checkbox" name="came" value={`guest:${g.id}`} defaultChecked={g.attended ?? true} />
                      {g.name} <span className="meta">{g.isMember ? t.member : t.nonMember} · {t.addedByHand}</span>
                    </label>
                  ))}
                  <p style={{ marginTop: 10 }}><button className="btn sm" type="submit">{t.saveAttendance}</button></p>
                </form>
              ) : (
                <>{e.kind !== "FUSION" && <p className="meta">{t.attendanceOpensLater}</p>}</>
              )}
              {guests.length > 0 && (
                <ul className="desk-list">
                  {guests.map((g) => (
                    <li key={g.id}>
                      <span>{g.name} <span className="meta">· {t.addedByHand}{g.phone ? ` · ${g.phone}` : ""}</span></span>
                      <form action={doRemoveGuest}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="guestId" value={g.id} />
                        <button className="btn sm ghost" type="submit">{t.remove}</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
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
            </div>

            <form action={doAddGuest} className="desk-add">
              <h3>{t.addGuest}</h3>
              <p className="meta">{t.addGuestHint}</p>
              <input type="hidden" name="eventId" value={e.id} />
              <label htmlFor="g-name">{t.guestName}</label>
              <input id="g-name" name="name" required maxLength={80} />
              <label htmlFor="g-phone">{t.guestPhone}</label>
              <input id="g-phone" name="phone" maxLength={40} inputMode="tel" />
              <label className="row check" style={{ fontWeight: 400 }}><input type="checkbox" name="isMember" value="1" /> {t.guestIsMember}</label>
              <p style={{ marginTop: 10 }}><button className="btn sm" type="submit">+ {t.addGuest}</button></p>
            </form>
          </div>
        </section>
      )}


      {(photos.length > 0 || mayAddPhotos) && (
        <section id="moments" className="ev-section">
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

      {e.partner && (
        <section className="ev-section">
          <h2>{t.whereItHappens}</h2>
          <div className="grid" style={{ maxWidth: 420 }}><PartnerCard p={{ ...e.partner, logo: partnerLogo }} locale={locale} member={member} /></div>
        </section>
      )}
    </article>
  );
}
