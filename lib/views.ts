import type { Event, Partner, Prisma, Reservation, User } from "@prisma/client";
import { prisma } from "./db";
import { priceRange, type PriceRange } from "./pricing";
import { earlyAccessEnds, payingCounts } from "./services/common";

export type EventCard = Event & {
  partner: Partner | null;
  captain: User | null;
  confirmed: number;
  waiting: number;
  range: PriceRange | null;
  mine: Reservation | null;
  earlyUntil: Date | null;
  hasPoster: boolean;
};

export async function loadEventCards(where: Prisma.EventWhereInput, userId: string | null, order: "asc" | "desc" = "asc") {
  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: order },
    include: { partner: true, captain: true, reservations: true, poster: { select: { eventId: true } } },
    take: 60,
  });
  return events.map((e): EventCard => {
    const c = payingCounts(e, e.reservations);
    const range =
      e.lockedPriceMember != null && e.lockedPriceNonMember != null
        ? { nonMember: [e.lockedPriceNonMember, e.lockedPriceNonMember] as [number, number], member: [e.lockedPriceMember, e.lockedPriceMember] as [number, number], fixed: true }
        : priceRange(e, c.nonMembers, c.members);
    const { reservations, poster, ...rest } = e;
    return {
      ...rest,
      confirmed: reservations.filter((r) => r.status === "CONFIRMED").length,
      waiting: reservations.filter((r) => r.status === "WAITLIST").length,
      range,
      mine: userId ? reservations.find((r) => r.userId === userId && r.status !== "CANCELLED") ?? null : null,
      earlyUntil: earlyAccessEnds(e),
      hasPoster: poster != null,
    };
  });
}

export function fmtRange(r: [number, number]) {
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}
