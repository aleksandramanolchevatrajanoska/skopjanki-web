import type { Event, Prisma, PrismaClient, Reservation, User } from "@prisma/client";
import { sendMail, type Mail } from "../email";
import { captainShareFor, hasCaptainSeat, pricesFor, splitPrices, type Prices } from "../pricing";
import { isMember } from "../membership";
import { HOUR } from "../time";

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient;
export type Outbox = Mail[];

export class AppError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function flush(out: Outbox) {
  for (const m of out) await sendMail(m);
}

/** Row lock so two girls cannot take the last seat at the same time. */
export async function lockEventRow(tx: Tx, eventId: string) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
}

export function seatTakenWhere(eventId: string, now: Date): Prisma.ReservationWhereInput {
  return {
    eventId,
    OR: [
      { status: "CONFIRMED" },
      { status: "OFFERED", offeredUntil: { gt: now } },
      { status: "PENDING_PAYMENT", holdUntil: { gt: now } },
    ],
  };
}

export async function seatsTaken(tx: Tx, eventId: string, now: Date) {
  return tx.reservation.count({ where: seatTakenWhere(eventId, now) });
}

export function earlyAccessEnds(e: Pick<Event, "publishedAt" | "memberEarlyHours">) {
  return e.publishedAt ? new Date(e.publishedAt.getTime() + e.memberEarlyHours * HOUR) : null;
}

export function lockTime(e: Pick<Event, "startsAt" | "lockHours">) {
  return new Date(e.startsAt.getTime() - e.lockHours * HOUR);
}

/** Paying = confirmed girls except the captain (she plays free). */
export function payingCounts(e: Pick<Event, "captainId" | "kind">, rs: Pick<Reservation, "userId" | "isMember" | "status" | "attended">[], onlyAttended = false) {
  let members = 0;
  let nonMembers = 0;
  for (const r of rs) {
    if (r.status !== "CONFIRMED") continue;
    if (hasCaptainSeat(e) && r.userId === e.captainId) continue;
    if (onlyAttended && r.attended !== true) continue;
    if (r.isMember) members++;
    else nonMembers++;
  }
  return { members, nonMembers };
}

export const CAPTAIN_SHARE_FROM = new Date("2026-11-28T10:05:00Z");

/** Keeps the event's captain share in step with who the captain is and the prices. Call after either changes. */
export async function syncCaptainShare(db: Tx | Db, eventId: string, now = new Date()) {
  const e = await db.event.findUnique({ where: { id: eventId }, include: { captain: true } });
  if (!e) return;
  // Terms created before this rule (e.g. Feel Good) keep their prices as they were.
  if (e.createdAt < CAPTAIN_SHARE_FROM) return;
  const share = captainShareFor(e, e.captain ? { isOwner: e.captain.isOwner, member: isMember(e.captain, now) } : null);
  if (share !== e.captainShare) await db.event.update({ where: { id: eventId }, data: { captainShare: share } });
}

export function priceForGirl(p: Prices, member: boolean) {
  return member ? p.member : p.nonMember;
}

/** Freezes the cash price for a weekly-type event (48h before by default). Idempotent. */
export async function lockPrices(tx: Tx, event: Event, now: Date): Promise<{ event: Event; prices: Prices }> {
  if (event.lockedAt && event.lockedPriceMember != null && event.lockedPriceNonMember != null) {
    return { event, prices: { member: event.lockedPriceMember, nonMember: event.lockedPriceNonMember } };
  }
  const rs = await tx.reservation.findMany({ where: { eventId: event.id, status: "CONFIRMED" }, include: { user: true } });
  for (const r of rs) {
    const m = isMember(r.user, now);
    if (m !== r.isMember) await tx.reservation.update({ where: { id: r.id }, data: { isMember: m } });
    r.isMember = m;
  }
  const c = payingCounts(event, rs);
  const prices =
    pricesFor(event, c.nonMembers, c.members) ??
    (event.totalCost != null ? splitPrices(event.totalCost, 1, 0, event.memberDiscountPct) : null) ?? { member: 0, nonMember: 0 };
  const updated = await tx.event.update({
    where: { id: event.id },
    data: { lockedAt: now, lockedPriceMember: prices.member, lockedPriceNonMember: prices.nonMember },
  });
  return { event: updated, prices };
}

export type ReservationWithUser = Reservation & { user: User };

export async function ownerEmailsFromDb(db: Tx | Db) {
  const owners = await db.user.findMany({ where: { isOwner: true }, select: { email: true } });
  const env = (process.env.OWNER_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set([...owners.map((o) => o.email), ...env]));
}
