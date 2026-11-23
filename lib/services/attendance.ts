import { pricesFor, type Prices } from "../pricing";
import { AppError, flush, lockEventRow, lockPrices, payingCounts, type Db, type Outbox } from "./common";

async function assertCaptainOrOwner(db: Db, actorId: string, eventId: string) {
  const [actor, e] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.event.findUniqueOrThrow({ where: { id: eventId } }),
  ]);
  if (!actor.isOwner && e.captainId !== actorId) throw new AppError("FORBIDDEN");
  return e;
}

/**
 * The captain marks who came. Girls who did not come owe their locked price to the club,
 * and the price for the girls who came is recalculated so the partner gets the full amount.
 */
export async function saveAttendance(db: Db, actorId: string, eventId: string, attendedUserIds: string[], now = new Date()): Promise<Prices | null> {
  const e0 = await assertCaptainOrOwner(db, actorId, eventId);
  if (e0.kind === "FUSION") throw new AppError("NO_CASH_FOR_FUSION");
  if (now.getTime() < e0.startsAt.getTime() - 3 * 3600_000) throw new AppError("TOO_EARLY");
  const came = new Set(attendedUserIds);
  const out: Outbox = [];
  const prices = await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const e = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    const { prices: locked } = await lockPrices(tx, e, now);
    const rs = await tx.reservation.findMany({ where: { eventId, status: "CONFIRMED" } });
    for (const r of rs) {
      const attended = r.userId === e.captainId ? true : came.has(r.userId);
      await tx.reservation.update({ where: { id: r.id }, data: { attended } });
      r.attended = attended;
      if (r.userId === e.captainId) continue;
      if (!attended) {
        await tx.debt.upsert({
          where: { userId_eventId: { userId: r.userId, eventId } },
          create: { userId: r.userId, eventId, amount: r.isMember ? locked.member : locked.nonMember, reason: "NO_SHOW" },
          update: {},
        });
      } else {
        await tx.debt.deleteMany({ where: { userId: r.userId, eventId, reason: "NO_SHOW", paidAt: null } });
      }
    }
    await tx.event.update({ where: { id: eventId }, data: { attendanceClosedAt: now } });
    const c = payingCounts(e, rs, true);
    return pricesFor(e, c.nonMembers, c.members);
  });
  await flush(out);
  return prices;
}

/** Captain (of a term where she is signed up) or organiser marks an old debt as paid. */
export async function markDebtPaid(db: Db, actorId: string, debtId: string, now = new Date()) {
  const [actor, debt] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actorId } }),
    db.debt.findUniqueOrThrow({ where: { id: debtId } }),
  ]);
  if (!actor.isOwner) {
    const shared = await db.event.findFirst({
      where: { captainId: actorId, reservations: { some: { userId: debt.userId, status: "CONFIRMED" } } },
    });
    if (!shared) throw new AppError("FORBIDDEN");
  }
  return db.debt.update({ where: { id: debtId }, data: { paidAt: now, collectedById: actorId } });
}

export async function openDebts(db: Db, userId: string) {
  return db.debt.findMany({ where: { userId, paidAt: null, waivedAt: null }, include: { event: true }, orderBy: { createdAt: "asc" } });
}
