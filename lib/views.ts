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
  posterVersion: number | null;
  /** Picture for cards: poster, picture link, first photo, or null (cards then draw a coloured cover). */
  cover: string | null;
};

/** The cover picture of an event, in the same order the event page uses. */
/** Link to an event's poster; the version makes a replaced picture show at once instead of a cached one. */
export function posterUrl(id: string, updatedAt?: Date | number | null) {
  const v = updatedAt == null ? "" : `?v=${typeof updatedAt === "number" ? updatedAt : updatedAt.getTime()}`;
  return `/posters/${id}${v}`;
}

export function coverOf(e: { id: string; imageUrl: string | null; hasPoster: boolean; posterVersion?: number | null; firstPhotoId?: string | null }) {
  if (e.hasPoster) return posterUrl(e.id, e.posterVersion);
  if (e.imageUrl) return e.imageUrl;
  if (e.firstPhotoId) return `/photos/${e.firstPhotoId}`;
  return null;
}

export async function loadEventCards(where: Prisma.EventWhereInput, userId: string | null, order: "asc" | "desc" = "asc") {
  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: order },
    include: {
      partner: true,
      captain: true,
      reservations: true,
      poster: { select: { eventId: true, updatedAt: true } },
      photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    take: 60,
  });
  return events.map((e): EventCard => {
    const c = payingCounts(e, e.reservations);
    const range =
      e.lockedPriceMember != null && e.lockedPriceNonMember != null
        ? { nonMember: [e.lockedPriceNonMember, e.lockedPriceNonMember] as [number, number], member: [e.lockedPriceMember, e.lockedPriceMember] as [number, number], fixed: true }
        : priceRange(e, c.nonMembers, c.members);
    const { reservations, poster, photos, ...rest } = e;
    return {
      ...rest,
      confirmed: reservations.filter((r) => r.status === "CONFIRMED").length,
      waiting: reservations.filter((r) => r.status === "WAITLIST").length,
      range,
      mine: userId ? reservations.find((r) => r.userId === userId && r.status !== "CANCELLED") ?? null : null,
      earlyUntil: earlyAccessEnds(e),
      hasPoster: poster != null,
      posterVersion: poster?.updatedAt.getTime() ?? null,
      cover: coverOf({ id: e.id, imageUrl: e.imageUrl, hasPoster: poster != null, posterVersion: poster?.updatedAt.getTime(), firstPhotoId: photos[0]?.id }),
    };
  });
}

export function fmtRange(r: [number, number]) {
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}
