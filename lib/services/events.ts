import type { Event, EventKind, PricingMode } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { appUrl } from "../email";
import { cleanVideoLinks, toEmbed } from "../embeds";
import { isMember } from "../membership";
import { formatDateTime, weekKey } from "../time";
import { AppError, flush, lockEventRow, ownerEmailsFromDb, type Db, type Outbox, type Tx } from "./common";
import { partnerListMail } from "./notifications";

export const VIBES = ["ACTIVE", "SOCIAL", "BOTH"];

/** "11:00 Yoga" per line -> [["11:00","Yoga"], ...]. A line without a time keeps an empty time. */
export function parseAgenda(text: string): [string, string][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => {
      const m = /^(\d{1,2}[:.]\d{2})\s*[-–·]?\s*(.*)$/.exec(l);
      return m ? [m[1].replace(".", ":"), m[2].slice(0, 80)] : ["", l.slice(0, 80)];
    });
}

export type EventInput = {
  kind: EventKind;
  title: string;
  description?: string | null;
  sport?: string | null;
  level?: string | null;
  vibe?: string | null; // ACTIVE | SOCIAL | BOTH
  tagline?: string | null;
  agenda?: [string, string][] | null;
  instagramUrl?: string | null;
  videoUrls?: string[];
  partnerId?: string | null;
  place?: string | null;
  startsAt: Date;
  minSpots: number;
  maxSpots: number;
  durationMin?: number | null;
  membersOnly?: boolean;
  pricingMode: PricingMode;
  totalCost?: number | null;
  priceNonMember?: number | null;
  priceMember?: number | null;
  memberDiscountPct?: number;
};

/**
 * Fusion events are always paid online, so choosing Fusion sets that by itself. An event that
 * already happened (added afterwards, for the record) needs no price.
 */
export function normalizeEventInput<T extends EventInput>(i: T, now = new Date()): T {
  const out = { ...i };
  if (out.kind === "FUSION") out.pricingMode = "ONLINE";
  else if (out.pricingMode === "ONLINE") out.pricingMode = "PER_PERSON"; // e.g. a fusion event turned into a weekly one
  if (out.startsAt < now) {
    const missing = out.pricingMode === "SPLIT" ? !(out.totalCost && out.totalCost > 0) : out.priceNonMember == null;
    if (missing) {
      out.pricingMode = out.kind === "FUSION" ? "ONLINE" : "PER_PERSON";
      out.priceNonMember = 0;
      out.priceMember = 0;
      out.totalCost = null;
    }
  }
  return out;
}

function validate(i: EventInput) {
  if (!i.title.trim()) throw new AppError("TITLE_REQUIRED");
  if (i.maxSpots < 1 || i.minSpots < 1 || i.minSpots > i.maxSpots) throw new AppError("BAD_SPOTS");
  // The price is optional: an event without one is shown as "price and sign-ups soon".
  if (i.totalCost != null && i.totalCost < 0) throw new AppError("PRICE_MISSING");
  if (i.priceNonMember != null && i.priceNonMember < 0) throw new AppError("PRICE_MISSING");
  if (i.kind === "FUSION" && i.pricingMode !== "ONLINE") throw new AppError("FUSION_IS_ONLINE");
  if (i.kind !== "FUSION" && i.pricingMode === "ONLINE") throw new AppError("ONLINE_ONLY_FUSION");
}

function data(i: EventInput) {
  return {
    kind: i.kind,
    title: i.title.trim(),
    description: i.description?.trim() || null,
    sport: i.sport?.trim() || null,
    level: i.level || null,
    vibe: i.vibe && VIBES.includes(i.vibe) ? i.vibe : null,
    tagline: i.tagline?.trim().slice(0, 120) || null,
    instagramUrl: i.instagramUrl ? toEmbed(i.instagramUrl)?.url ?? null : null,
    videoUrls: cleanVideoLinks(i.videoUrls ?? []),
    agenda: i.agenda && i.agenda.length ? i.agenda.slice(0, 12) : Prisma.DbNull,
    partnerId: i.partnerId || null,
    place: i.place?.trim() || null,
    startsAt: i.startsAt,
    weekKey: weekKey(i.startsAt),
    minSpots: i.minSpots,
    durationMin: i.durationMin && i.durationMin > 0 ? Math.min(i.durationMin, 24 * 60) : null,
    membersOnly: Boolean(i.membersOnly),
    maxSpots: i.maxSpots,
    pricingMode: i.pricingMode,
    totalCost: i.pricingMode === "SPLIT" ? i.totalCost ?? null : null,
    priceNonMember: i.pricingMode === "SPLIT" ? null : i.priceNonMember ?? null,
    // Fusion: the member price, or the full one. Price per girl: the member price if typed in, else from the discount.
    priceMember: i.pricingMode === "ONLINE" ? i.priceMember ?? i.priceNonMember ?? null : i.pricingMode === "PER_PERSON" ? i.priceMember ?? null : null,
    memberDiscountPct: i.memberDiscountPct ?? DEFAULT_MEMBER_DISCOUNT,
  };
}

/** Organiser creates a club event (weekly, week-4 special or fusion). It is live at once. */
/** Default members' discount when the partner has none of its own. */
export const DEFAULT_MEMBER_DISCOUNT = 20;

/** Members' discount on an event with no partner. */
export const NO_PARTNER_MEMBER_DISCOUNT = 10;

/**
 * Members' discount: at a partner, the partner's own (or 20 % when it has none);
 * with no partner, 10 %. A discount set on the input itself wins.
 */
export async function withPartnerDiscount<T extends { partnerId?: string | null; memberDiscountPct?: number }>(db: Db, input: T): Promise<T> {
  if (input.memberDiscountPct != null) return input;
  if (!input.partnerId) return { ...input, memberDiscountPct: NO_PARTNER_MEMBER_DISCOUNT };
  const p = await db.partner.findUnique({ where: { id: input.partnerId }, select: { memberDiscountPct: true } });
  return { ...input, memberDiscountPct: p?.memberDiscountPct ?? DEFAULT_MEMBER_DISCOUNT };
}

export async function createEvent(db: Db, ownerId: string, input0: EventInput, now = new Date()) {
  if (input0.kind === "MEMBER_PLAN") throw new AppError("USE_PROPOSE_PLAN");
  const input = await withPartnerDiscount(db, normalizeEventInput(input0, now));
  validate(input);
  const out: Outbox = [];
  const event = await db.$transaction(async (tx) => {
    const e = await tx.event.create({ data: { ...data(input), status: "APPROVED", publishedAt: now, createdById: ownerId } });
    await partnerListMail(tx, e.id, out, "new");
    return e;
  });
  await flush(out);
  return event;
}

export async function updateEvent(db: Db, eventId: string, input1: EventInput) {
  const e = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const input0 = normalizeEventInput({ ...input1, kind: input1.kind ?? e.kind });
  // The members' discount follows the partner: it changes only when the partner changes
  // (a partner's new discount reaches its events through setPartnerDiscount).
  const keep = input0.memberDiscountPct == null && (input0.partnerId ?? null) === e.partnerId;
  const input = keep ? { ...input0, memberDiscountPct: e.memberDiscountPct } : await withPartnerDiscount(db, input0);
  validate(input);
  // Moving between Play for fun and Fusion is allowed, unless someone already paid online for it
  // (refund her first). A fusion event has no captain.
  const toFusion = input.kind === "FUSION" && e.kind !== "FUSION";
  const fromFusion = e.kind === "FUSION" && input.kind !== "FUSION";
  if (fromFusion) {
    const paid = await db.reservation.count({ where: { eventId, paidAmount: { gt: 0 }, status: { not: "CANCELLED" } } });
    if (paid > 0) throw new AppError("EVENT_HAS_PAYMENTS");
  }
  const taken = await db.reservation.count({ where: { eventId, status: "CONFIRMED" } });
  if (input.maxSpots < taken) throw new AppError("BAD_SPOTS");
  const d = data(input);
  // The cash price stays fixed unless something that sets it changed.
  const priceChanged =
    d.pricingMode !== e.pricingMode || d.totalCost !== e.totalCost || d.priceNonMember !== e.priceNonMember ||
    d.priceMember !== e.priceMember || d.memberDiscountPct !== e.memberDiscountPct || d.startsAt.getTime() !== e.startsAt.getTime();
  return db.event.update({
    where: { id: eventId },
    data: {
      ...d,
      ...(priceChanged || toFusion || fromFusion ? { lockedAt: null, lockedPriceMember: null, lockedPriceNonMember: null } : {}),
      ...(toFusion ? { captainId: null } : {}),
    },
  });
}

/** The organiser edits any event; a captain her term; a member the plan she proposed. */
export function canEditEvent(user: { id: string; isOwner: boolean }, e: { captainId: string | null; createdById: string; kind: EventKind }) {
  return user.isOwner || e.captainId === user.id || (e.kind === "MEMBER_PLAN" && e.createdById === user.id);
}

/** Edit from the event page. Girls hear about a new time or place; the organiser hears about edits by others. */
export async function editEvent(db: Db, actorId: string, eventId: string, input: EventInput) {
  const [actor, before] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.event.findUniqueOrThrow({ where: { id: eventId }, include: { partner: true } }),
  ]);
  if (!canEditEvent(actor, before)) throw new AppError("FORBIDDEN");
  if (before.status === "CANCELLED") throw new AppError("EVENT_NOT_OPEN");
  const safe: EventInput = actor.isOwner
    ? input
    : { ...input, kind: before.kind, pricingMode: input.pricingMode === "ONLINE" ? before.pricingMode : input.pricingMode, memberDiscountPct: undefined };
  const after = await updateEvent(db, eventId, safe);
  const out: Outbox = [];
  const moved = after.startsAt.getTime() !== before.startsAt.getTime() || after.place !== before.place || after.partnerId !== before.partnerId;
  if (moved && after.status === "APPROVED") {
    const girls = await db.reservation.findMany({ where: { eventId, status: { in: ["CONFIRMED", "WAITLIST", "OFFERED"] }, userId: { not: actorId } }, include: { user: true } });
    const partner = after.partnerId ? await db.partner.findUnique({ where: { id: after.partnerId } }) : null;
    if (girls.length)
      out.push({
        to: girls.map((g) => g.user.email),
        subject: `Changed: ${after.title}`,
        text: `${after.title} has changed.\nNow: ${formatDateTime(after.startsAt, "en")}${partner ? `, ${partner.name}` : after.place ? `, ${after.place}` : ""}.\nIf you can no longer come, cancel on the site:\n${appUrl(`/app/events/${eventId}`)}`,
      });
  }
  if (!actor.isOwner) {
    out.push({
      to: await ownerEmailsFromDb(db),
      subject: `${actor.name} edited: ${after.title}`,
      text: `${actor.name} edited "${after.title}" (${formatDateTime(after.startsAt, "en")}).\n${appUrl(`/app/events/${eventId}`)}`,
    });
  }
  await flush(out);
  return after;
}

/** A member proposes her own plan: max one per week (Mon-Sun), waits for the organiser. */
export async function proposePlan(db: Db, userId: string, input0: Omit<EventInput, "kind">, now = new Date()) {
  const input = await withPartnerDiscount(db, input0);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "APPROVED") throw new AppError("NOT_APPROVED");
  if (!isMember(user, now)) throw new AppError("MEMBERS_ONLY");
  if (input.startsAt <= now) throw new AppError("DATE_IN_PAST");
  const full: EventInput = { ...input, kind: "MEMBER_PLAN" };
  if (full.pricingMode === "ONLINE") throw new AppError("ONLINE_ONLY_FUSION");
  validate(full);
  const wk = weekKey(input.startsAt);
  const out: Outbox = [];
  try {
    const event = await db.$transaction(async (tx) => {
      const existing = await tx.event.findFirst({
        where: { kind: "MEMBER_PLAN", createdById: userId, weekKey: wk, status: { in: ["PENDING", "APPROVED"] } },
      });
      if (existing) throw new AppError("ONE_PLAN_PER_WEEK");
      const e = await tx.event.create({ data: { ...data(full), status: "PENDING", createdById: userId, captainId: userId } });
      await tx.reservation.create({ data: { eventId: e.id, userId, status: "CONFIRMED", isMember: true } });
      out.push({
        to: await ownerEmailsFromDb(tx),
        subject: `New plan waiting for approval: ${e.title}`,
        text: `${user.name} proposed "${e.title}" on ${formatDateTime(e.startsAt, "en")}.\nApprove or reject: ${appUrl("/admin")}`,
      });
      return e;
    });
    await flush(out);
    return event;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("ONE_PLAN_PER_WEEK");
    throw e;
  }
}

/** Approve = live for everyone. Reject = deleted, so the member's week is free again. */
export async function decidePlan(db: Db, eventId: string, approve: boolean, now = new Date()) {
  const out: Outbox = [];
  await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { createdBy: true } });
    if (e.kind !== "MEMBER_PLAN" || e.status !== "PENDING") throw new AppError("NOT_PENDING");
    if (approve) {
      await tx.event.update({ where: { id: eventId }, data: { status: "APPROVED", publishedAt: now } });
      out.push({ to: e.createdBy.email, subject: `Your plan is live: ${e.title}`, text: `Your plan "${e.title}" was approved and is now open for sign-up.\n${appUrl(`/app/events/${e.id}`)}` });
      await partnerListMail(tx, e.id, out, "new");
    } else {
      await tx.event.delete({ where: { id: eventId } });
      out.push({ to: e.createdBy.email, subject: `Your plan was not approved: ${e.title}`, text: `Your plan "${e.title}" was not approved this time. Your week is free, so you can propose another plan.` });
    }
  });
  await flush(out);
}

/**
 * Organiser cancels (e.g. the minimum was not reached). Nobody owes anything;
 * fusion payments are returned (returns the Stripe refunds to make after commit).
 */
export async function cancelEvent(db: Db, eventId: string, reason: string, now = new Date()) {
  const out: Outbox = [];
  const refunds: { paymentIntentId: string; amount: number }[] = [];
  await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { partner: true } });
    if (e.status === "CANCELLED") return;
    const rs = await tx.reservation.findMany({ where: { eventId, status: { not: "CANCELLED" } }, include: { user: true } });
    for (const r of rs) {
      if (r.creditUsed > 0) await tx.user.update({ where: { id: r.userId }, data: { creditBalance: { increment: r.creditUsed } } });
      if (r.status === "CONFIRMED" && r.paidAmount > 0 && r.stripePaymentIntentId) {
        refunds.push({ paymentIntentId: r.stripePaymentIntentId, amount: r.paidAmount });
      }
    }
    await tx.reservation.updateMany({ where: { eventId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelledAt: now, holdUntil: null, offeredUntil: null } });
    await tx.debt.updateMany({ where: { eventId, paidAt: null }, data: { waivedAt: now } });
    await tx.event.update({ where: { id: eventId }, data: { status: "CANCELLED", cancelReason: reason || null } });
    const emails = rs.map((r) => r.user.email);
    if (emails.length) {
      out.push({
        to: emails,
        subject: `Cancelled: ${e.title}`,
        text: `${e.title} on ${formatDateTime(e.startsAt, "en")} is cancelled${reason ? ` (${reason})` : ""}. Nobody owes anything${e.kind === "FUSION" ? " and payments are returned in full" : ""}.`,
      });
    }
    if (e.partner?.email) out.push({ to: e.partner.email, subject: `Cancelled: Skopjanki ${e.title}`, text: `The Skopjanki term "${e.title}" on ${formatDateTime(e.startsAt, "en")} is cancelled. Nobody owes anything.` });
  });
  await flush(out);
  return refunds;
}

export type EventWithCounts = Event & { taken: number };

/**
 * Deletes every event that has not started yet (sport, workshops, plans and fusion), with their
 * sign-ups, chat, photos and pictures. Events where a girl already paid online are kept, because
 * she needs a refund first; their titles come back so the organiser can deal with them.
 */
export async function deleteUpcomingEvents(db: Db, now = new Date()) {
  const upcoming = await db.event.findMany({
    where: { startsAt: { gte: now } },
    select: { id: true, title: true, reservations: { where: { paidAmount: { gt: 0 }, status: { not: "CANCELLED" } }, select: { id: true } } },
  });
  const paid = upcoming.filter((e) => e.reservations.length > 0);
  const ids = upcoming.filter((e) => e.reservations.length === 0).map((e) => e.id);
  const { count } = await db.event.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count, keptPaid: paid.map((e) => e.title) };
}

/**
 * Deletes one event with its sign-ups, chat and pictures. Refused while a girl has paid online
 * for it, because she needs a refund first.
 */
export async function deleteEvent(db: Db, eventId: string) {
  const paid = await db.reservation.count({ where: { eventId, paidAmount: { gt: 0 }, status: { not: "CANCELLED" } } });
  if (paid > 0) throw new AppError("EVENT_HAS_PAYMENTS");
  await db.event.delete({ where: { id: eventId } });
}
