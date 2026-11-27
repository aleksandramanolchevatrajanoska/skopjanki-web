import type { Event } from "@prisma/client";
import { appUrl } from "../email";
import { isMember, isMembersOnly } from "../membership";
import { hasPrice, pricesFor } from "../pricing";
import { DAY, HOUR, formatDateTime } from "../time";
import {
  AppError, flush, lockEventRow, lockPrices, lockTime, earlyAccessEnds, seatsTaken,
  type Db, type Outbox, type Tx,
} from "./common";

const HOLD_MINUTES = 30; // Stripe Checkout sessions last at least 30 minutes
const OFFER_HOURS = 12;
const FUSION_REFUND_DAYS = 7;

export type ReserveResult = {
  reservationId: string;
  status: "CONFIRMED" | "WAITLIST" | "PENDING_PAYMENT";
  amountDue?: number;
};

function fusionPrice(e: Event, member: boolean) {
  const p = pricesFor(e, 0, 0);
  if (!p) throw new AppError("PRICE_MISSING");
  return member ? p.member : p.nonMember;
}

/** Reserve a seat. Members can book from publication; everyone else after the members-first window. */
export async function reserve(db: Db, userId: string, eventId: string, now = new Date()): Promise<ReserveResult> {
  const out: Outbox = [];
  const res = await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event || event.status !== "APPROVED") throw new AppError("EVENT_NOT_OPEN");
    if (event.startsAt <= now) throw new AppError("EVENT_STARTED");
    if (!hasPrice(event)) throw new AppError("PRICE_NOT_SET"); // announced, sign-ups open once it has a price
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== "APPROVED") throw new AppError("NOT_APPROVED");
    const member = isMember(user, now);
    const early = earlyAccessEnds(event);
    if (!member && isMembersOnly(event)) throw new AppError("MEMBERS_ONLY_EVENT");
    if (!member && early && now < early) throw new AppError("MEMBERS_FIRST");

    const existing = await tx.reservation.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (existing && existing.status !== "CANCELLED") throw new AppError("ALREADY_RESERVED");

    const full = (await seatsTaken(tx, eventId, now)) >= event.maxSpots;
    let status: ReserveResult["status"] = "CONFIRMED";
    let holdUntil: Date | null = null;
    let creditUsed = 0;
    let amountDue: number | undefined;

    if (full) status = "WAITLIST";
    else if (event.kind === "FUSION") {
      const price = fusionPrice(event, member);
      creditUsed = Math.min(user.creditBalance, price);
      amountDue = price - creditUsed;
      if (amountDue > 0) {
        status = "PENDING_PAYMENT";
        holdUntil = new Date(now.getTime() + HOLD_MINUTES * 60_000);
      }
      if (creditUsed > 0) await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: creditUsed } } });
    }

    const data = {
      status, isMember: member, holdUntil, creditUsed, offeredUntil: null, paidAmount: 0, attended: null,
      lateCancel: false, cancelledAt: null, stripeSessionId: null, stripePaymentIntentId: null, replacedAt: null,
    };
    const r = existing
      ? await tx.reservation.update({ where: { id: existing.id }, data })
      : await tx.reservation.create({ data: { ...data, eventId, userId } });

    if (status === "CONFIRMED") await handleReplacement(tx, event, now, out);
    return { reservationId: r.id, status, amountDue };
  });
  await flush(out);
  return res;
}

/** When a free seat is taken again after a late cancellation, the late canceller is let off. */
async function handleReplacement(tx: Tx, event: Event, now: Date, out: Outbox) {
  const late = await tx.reservation.findFirst({
    where: { eventId: event.id, status: "CANCELLED", lateCancel: true, replacedAt: null },
    orderBy: { cancelledAt: "asc" },
    include: { user: true },
  });
  if (!late) return;
  await tx.reservation.update({ where: { id: late.id }, data: { replacedAt: now } });
  if (event.kind === "FUSION") {
    const credit = late.paidAmount + late.creditUsed;
    if (credit > 0) {
      await tx.user.update({ where: { id: late.userId }, data: { creditBalance: { increment: credit } } });
      out.push({
        to: late.user.email,
        subject: `Your seat at ${event.title} was taken`,
        text: `Good news: someone took your seat at ${event.title}. ${credit} MKD is saved as credit for your next fusion event.`,
      });
    }
  } else {
    await tx.debt.updateMany({ where: { userId: late.userId, eventId: event.id, paidAt: null }, data: { waivedAt: now } });
    out.push({
      to: late.user.email,
      subject: `Your place at ${event.title} was taken`,
      text: `Someone took your place at ${event.title}, so you owe nothing for it.`,
    });
  }
}

/** Gives free seats to the first girls on the waiting list (12 hours to confirm). */
export async function offerNext(tx: Tx, event: Event, now: Date, out: Outbox) {
  if (event.status !== "APPROVED" || event.startsAt <= now) return;
  let free = event.maxSpots - (await seatsTaken(tx, event.id, now));
  while (free > 0) {
    const next = await tx.reservation.findFirst({
      where: { eventId: event.id, status: "WAITLIST" },
      orderBy: { createdAt: "asc" },
      include: { user: true },
    });
    if (!next) break;
    const until = new Date(Math.min(now.getTime() + OFFER_HOURS * HOUR, event.startsAt.getTime()));
    await tx.reservation.update({ where: { id: next.id }, data: { status: "OFFERED", offeredUntil: until } });
    out.push({
      to: next.user.email,
      subject: `A place opened up: ${event.title}`,
      text: `A place opened up at ${event.title} (${formatDateTime(event.startsAt, "en")}).\nConfirm within ${OFFER_HOURS} hours, otherwise it goes to the next girl:\n${appUrl(`/app/events/${event.id}`)}`,
    });
    free--;
  }
}

export type CancelResult = { late: boolean; debt: number; credit: number };

export async function cancelReservation(db: Db, userId: string, eventId: string, now = new Date()): Promise<CancelResult> {
  const out: Outbox = [];
  const res = await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    const r = await tx.reservation.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!r || r.status === "CANCELLED") throw new AppError("NOT_RESERVED");
    if (event.captainId === userId && event.kind !== "FUSION") throw new AppError("CAPTAIN_CANNOT_CANCEL");
    if (event.startsAt <= now) throw new AppError("EVENT_STARTED");

    let late = false;
    let debt = 0;
    let credit = 0;
    if (r.status === "CONFIRMED") {
      if (event.kind === "FUSION") {
        if (now.getTime() <= event.startsAt.getTime() - FUSION_REFUND_DAYS * DAY) credit = r.paidAmount + r.creditUsed;
        else late = true;
      } else if (now >= lockTime(event)) {
        late = true;
        const { prices } = await lockPrices(tx, event, now);
        debt = r.isMember ? prices.member : prices.nonMember;
        await tx.debt.upsert({
          where: { userId_eventId: { userId, eventId } },
          create: { userId, eventId, amount: debt, reason: "LATE_CANCEL" },
          update: { amount: debt, reason: "LATE_CANCEL", waivedAt: null, paidAt: null },
        });
      }
    } else if (r.status === "PENDING_PAYMENT") {
      credit = r.creditUsed;
    }
    await tx.reservation.update({
      where: { id: r.id },
      data: { status: "CANCELLED", cancelledAt: now, lateCancel: late, holdUntil: null, offeredUntil: null },
    });
    if (credit > 0) await tx.user.update({ where: { id: userId }, data: { creditBalance: { increment: credit } } });
    if (r.status !== "WAITLIST") await offerNext(tx, event, now, out);
    return { late, debt, credit };
  });
  await flush(out);
  return res;
}

export async function acceptOffer(db: Db, userId: string, eventId: string, now = new Date()): Promise<ReserveResult> {
  const out: Outbox = [];
  const res = await db.$transaction(async (tx) => {
    await lockEventRow(tx, eventId);
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    const r = await tx.reservation.findUnique({ where: { eventId_userId: { eventId, userId } }, include: { user: true } });
    if (!r || r.status !== "OFFERED" || !r.offeredUntil || r.offeredUntil <= now) throw new AppError("OFFER_EXPIRED");
    const member = isMember(r.user, now);
    if (event.kind === "FUSION") {
      const price = fusionPrice(event, member);
      const creditUsed = Math.min(r.user.creditBalance, price);
      const amountDue = price - creditUsed;
      if (creditUsed > 0) await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: creditUsed } } });
      if (amountDue > 0) {
        await tx.reservation.update({
          where: { id: r.id },
          data: { status: "PENDING_PAYMENT", isMember: member, creditUsed, holdUntil: new Date(now.getTime() + HOLD_MINUTES * 60_000), offeredUntil: null },
        });
        return { reservationId: r.id, status: "PENDING_PAYMENT" as const, amountDue };
      }
      await tx.reservation.update({ where: { id: r.id }, data: { status: "CONFIRMED", isMember: member, creditUsed, offeredUntil: null } });
    } else {
      await tx.reservation.update({ where: { id: r.id }, data: { status: "CONFIRMED", isMember: member, offeredUntil: null } });
    }
    await handleReplacement(tx, event, now, out);
    return { reservationId: r.id, status: "CONFIRMED" as const };
  });
  await flush(out);
  return res;
}

/** Stripe webhook: the fusion seat is confirmed only once the payment succeeded. */
export async function confirmPayment(db: Db, stripeSessionId: string, paymentIntentId: string | null, amountPaid: number, now = new Date()) {
  const out: Outbox = [];
  const res = await db.$transaction(async (tx) => {
    const r0 = await tx.reservation.findUnique({ where: { stripeSessionId } });
    if (!r0) return "UNKNOWN" as const;
    await lockEventRow(tx, r0.eventId);
    const r = await tx.reservation.findUniqueOrThrow({ where: { id: r0.id }, include: { user: true, event: true } });
    if (r.status === "CONFIRMED") return "ALREADY" as const;
    const others = await tx.reservation.count({
      where: { eventId: r.eventId, id: { not: r.id }, OR: [{ status: "CONFIRMED" }, { status: "OFFERED", offeredUntil: { gt: now } }, { status: "PENDING_PAYMENT", holdUntil: { gt: now } }] },
    });
    if (r.status === "PENDING_PAYMENT" && others < r.event.maxSpots) {
      await tx.reservation.update({
        where: { id: r.id },
        data: { status: "CONFIRMED", paidAmount: amountPaid, stripePaymentIntentId: paymentIntentId, holdUntil: null },
      });
      await handleReplacement(tx, r.event, now, out);
      out.push({
        to: r.user.email,
        subject: `You're in: ${r.event.title}`,
        text: `Payment received. See you at ${r.event.title} on ${formatDateTime(r.event.startsAt, "en")}!\n${appUrl(`/app/events/${r.eventId}`)}`,
      });
      return "CONFIRMED" as const;
    }
    // Seat no longer held: keep the money as credit so nothing is lost.
    await tx.user.update({ where: { id: r.userId }, data: { creditBalance: { increment: amountPaid } } });
    await tx.reservation.update({ where: { id: r.id }, data: { stripePaymentIntentId: paymentIntentId } });
    out.push({
      to: r.user.email,
      subject: `Payment saved as credit: ${r.event.title}`,
      text: `Your payment came in after your seat hold ended and the event was full. ${amountPaid} MKD is saved as credit for your next fusion event.`,
    });
    return "CREDITED" as const;
  });
  await flush(out);
  return res;
}

/** Ends expired waiting-list offers and unpaid holds, and passes the seats on. */
export async function expireStale(db: Db, now = new Date()) {
  const stale = await db.reservation.findMany({
    where: {
      OR: [
        { status: "OFFERED", offeredUntil: { lte: now } },
        { status: "PENDING_PAYMENT", holdUntil: { lte: now } },
      ],
    },
    select: { eventId: true },
    distinct: ["eventId"],
  });
  for (const { eventId } of stale) {
    const out: Outbox = [];
    await db.$transaction(async (tx) => {
      await lockEventRow(tx, eventId);
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      const rs = await tx.reservation.findMany({
        where: { eventId, OR: [{ status: "OFFERED", offeredUntil: { lte: now } }, { status: "PENDING_PAYMENT", holdUntil: { lte: now } }] },
      });
      for (const r of rs) {
        await tx.reservation.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelledAt: now, holdUntil: null, offeredUntil: null } });
        if (r.status === "PENDING_PAYMENT" && r.creditUsed > 0) {
          await tx.user.update({ where: { id: r.userId }, data: { creditBalance: { increment: r.creditUsed } } });
        }
      }
      await offerNext(tx, event, now, out);
    });
    await flush(out);
  }
}
