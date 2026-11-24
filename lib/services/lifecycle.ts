import { appUrl } from "../email";
import { isMember } from "../membership";
import { DAY, HOUR, formatDateTime } from "../time";
import { flush, lockPrices, lockTime, ownerEmailsFromDb, type Db, type Outbox } from "./common";
import { partnerListMail } from "./notifications";
import { expireStale } from "./reservations";
import { isWeeklySendTime, sendWeekly } from "./weekly";

/** Runs every ~15 minutes (Vercel Cron → /api/cron). Safe to run any number of times. */
export async function runLifecycle(db: Db, now = new Date()) {
  await expireStale(db, now);

  // 0. Weekly letter, Monday morning (once per week).
  if (isWeeklySendTime(now)) await sendWeekly(db, now);

  // 1. Lock cash prices 48h before weekly-type terms; tell girls, partner, and the organiser if the minimum is not reached.
  const toLock = await db.event.findMany({
    where: { status: "APPROVED", kind: { not: "FUSION" }, lockedAt: null, startsAt: { gt: now } },
  });
  for (const e of toLock) {
    if (now < lockTime(e)) continue;
    const out: Outbox = [];
    await db.$transaction(async (tx) => {
      const { prices } = await lockPrices(tx, e, now);
      const rs = await tx.reservation.findMany({ where: { eventId: e.id, status: "CONFIRMED" }, include: { user: true } });
      for (const r of rs) {
        const captain = r.userId === e.captainId;
        const debts = await tx.debt.findMany({ where: { userId: r.userId, paidAt: null, waivedAt: null } });
        const owed = debts.reduce((s, d) => s + d.amount, 0);
        const price = captain ? 0 : r.isMember ? prices.member : prices.nonMember;
        out.push({
          to: r.user.email,
          subject: `${e.title}: bring ${price + owed} MKD in cash`,
          text: `${e.title}, ${formatDateTime(e.startsAt, "en")}.\nYour price is now fixed: ${captain ? "you're the captain, you play free" : `${price} MKD`}.${owed ? `\nPlus ${owed} MKD from a missed term, so ${price + owed} MKD in total.` : ""}\nIf you cancel now or don't come, you still owe your part.\n${appUrl(`/app/events/${e.id}`)}`,
        });
      }
      await partnerListMail(tx, e.id, out, "locked");
      if (rs.length < e.minSpots && !e.minimumAlertSentAt) {
        await tx.event.update({ where: { id: e.id }, data: { minimumAlertSentAt: now } });
        out.push({
          to: await ownerEmailsFromDb(tx),
          subject: `Minimum not reached: ${e.title}`,
          text: `${e.title} (${formatDateTime(e.startsAt, "en")}) has ${rs.length} girls, minimum is ${e.minSpots}.\nCancel it or keep it: ${appUrl(`/admin/events/${e.id}`)}`,
        });
      }
    });
    await flush(out);
  }

  // 2. Captain must still be a paying member.
  const withCaptains = await db.event.findMany({
    where: { status: "APPROVED", captainId: { not: null }, captainAlertSentAt: null, startsAt: { gt: now, lt: new Date(now.getTime() + 7 * DAY) } },
    include: { captain: true },
  });
  for (const e of withCaptains) {
    if (e.captain && !isMember(e.captain, e.startsAt)) {
      await db.event.update({ where: { id: e.id }, data: { captainAlertSentAt: now } });
      await flush([{
        to: await ownerEmailsFromDb(db),
        subject: `Captain's membership ends before ${e.title}`,
        text: `${e.captain.name}'s membership ends before ${e.title} (${formatDateTime(e.startsAt, "en")}). Choose another captain: ${appUrl(`/admin/events/${e.id}`)}`,
      }]);
    }
  }

  // 3. Reminder 24 hours before.
  const soon = await db.event.findMany({
    where: { status: "APPROVED", reminderSentAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR) } },
    include: { reservations: { where: { status: "CONFIRMED" }, include: { user: true } } },
  });
  for (const e of soon) {
    await db.event.update({ where: { id: e.id }, data: { reminderSentAt: now } });
    const to = e.reservations.map((r) => r.user.email);
    if (to.length)
      await flush([{ to, subject: `Tomorrow: ${e.title}`, text: `See you at ${e.title}, ${formatDateTime(e.startsAt, "en")}${e.place ? `, ${e.place}` : ""}.\n${appUrl(`/app/events/${e.id}`)}` }]);
  }
}
