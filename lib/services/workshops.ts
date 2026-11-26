import { pricesFor } from "../pricing";
import { AppError, type Db } from "./common";

/** What share of a workshop's takings goes to Skopjanki, unless the organiser sets another. */
export const DEFAULT_COMMISSION_PCT = 15;

export async function commissionPct(db: Db) {
  const row = await db.setting.findUnique({ where: { key: "workshop.commissionPct" } });
  const v = Number(row?.value);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : DEFAULT_COMMISSION_PCT;
}

export async function setCommissionPct(db: Db, pct: number) {
  const v = String(Math.max(0, Math.min(100, Math.round(pct))));
  await db.setting.upsert({ where: { key: "workshop.commissionPct" }, create: { key: "workshop.commissionPct", value: v }, update: { value: v } });
}

/** A workshop needs a price per girl: the host collects it and owes the club its share. */
export function checkWorkshopInput(i: { pricingMode: string; priceNonMember?: number | null }) {
  if (i.pricingMode !== "PER_PERSON" || !i.priceNonMember || i.priceNonMember <= 0) throw new AppError("WORKSHOP_PRICE");
}

/**
 * How much the host collected and owes the club. Counts the girls marked as came (or, before the
 * host ticks attendance, everyone signed up), never the host herself.
 */
export async function workshopCommission(db: Db, eventId: string) {
  const e = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { reservations: { where: { status: "CONFIRMED" } }, guests: true },
  });
  if (!e.workshop) return null;
  const p = pricesFor(e, 0, 0);
  if (!p) return null;
  const closed = e.attendanceClosedAt != null;
  const came = e.reservations.filter((r) => r.userId !== e.captainId && (closed ? r.attended === true : true));
  const guests = e.guests.filter((g) => (closed ? g.attended === true : true));
  const collected =
    came.reduce((s, r) => s + (r.isMember ? p.member : p.nonMember), 0) +
    guests.reduce((s, g) => s + (g.isMember ? p.member : p.nonMember), 0);
  const pct = e.commissionPct ?? DEFAULT_COMMISSION_PCT;
  return { girls: came.length + guests.length, collected, pct, owed: Math.round((collected * pct) / 100), final: closed, paidAt: e.commissionPaidAt };
}

export async function markCommissionPaid(db: Db, eventId: string, paid: boolean, now = new Date()) {
  await db.event.update({ where: { id: eventId }, data: { commissionPaidAt: paid ? now : null } });
}

/** A member proposes a paid workshop she leads: same approval and weekly limit as a plan, plus a price. */
export async function proposeWorkshop(
  db: Db,
  userId: string,
  input: Parameters<typeof import("./events").proposePlan>[2],
  poster: { mime: string; data: Buffer } | null,
  now = new Date(),
) {
  checkWorkshopInput(input);
  const { proposePlanWithPoster } = await import("./club");
  const e = await proposePlanWithPoster(db, userId, input, poster, now);
  return db.event.update({ where: { id: e.id }, data: { workshop: true, commissionPct: await commissionPct(db) } });
}
