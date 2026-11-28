import type { Event } from "@prisma/client";

/** Round up to the next 10 MKD so cash is easy and the partner is always covered. */
export function ceil10(n: number) {
  return Math.ceil(n / 10 - 1e-9) * 10;
}

export type Prices = { nonMember: number; member: number };

/**
 * Venue cost shared by the paying girls; members pay `discountPct` less.
 * nonMember price p solves: nonMembers * p + members * (1 - d) * p = totalCost
 */
export function splitPrices(totalCost: number, nonMembers: number, members: number, discountPct = 20): Prices | null {
  const f = 1 - discountPct / 100;
  const denom = nonMembers + f * members;
  if (denom <= 0) return null;
  const p = totalCost / denom;
  return { nonMember: ceil10(p), member: ceil10(p * f) };
}

type PricedEvent = Pick<Event, "kind" | "pricingMode" | "totalCost" | "priceNonMember" | "priceMember" | "memberDiscountPct" | "minSpots" | "maxSpots">;

/** Weekly / special / member plans have a captain who plays free and takes one of the spots. */
export function hasCaptainSeat(e: Pick<Event, "kind">) {
  return e.kind !== "FUSION";
}

/** Prices for a given number of paying girls (captain excluded). */
export function pricesFor(e: PricedEvent, payingNonMembers: number, payingMembers: number): Prices | null {
  switch (e.pricingMode) {
    case "SPLIT":
      return e.totalCost == null ? null : splitPrices(e.totalCost, payingNonMembers, payingMembers, e.memberDiscountPct);
    case "PER_PERSON":
      if (e.priceNonMember == null) return null;
      // A member price the organiser typed in is used as it is; otherwise it comes from the discount.
      return {
        nonMember: e.priceNonMember,
        member: e.priceMember != null ? e.priceMember : ceil10(e.priceNonMember * (1 - e.memberDiscountPct / 100)),
      };
    case "ONLINE":
      if (e.priceNonMember == null) return null;
      return { nonMember: e.priceNonMember, member: e.priceMember ?? e.priceNonMember };
  }
}

export type PriceRange = { nonMember: [number, number]; member: [number, number]; fixed: boolean };

/**
 * Range shown while sign-up is open: the high end is the price if the group stays as it is now
 * (or at the minimum), the low end is the price if the term fills up, keeping the current member ratio.
 */
export function priceRange(e: PricedEvent, payingNonMembers: number, payingMembers: number): PriceRange | null {
  if (e.pricingMode !== "SPLIT") {
    const p = pricesFor(e, 0, 0);
    return p && { nonMember: [p.nonMember, p.nonMember], member: [p.member, p.member], fixed: true };
  }
  const seat = hasCaptainSeat(e) ? 1 : 0;
  const minPaying = Math.max(1, e.minSpots - seat);
  const maxPaying = Math.max(1, e.maxSpots - seat);
  const now = payingNonMembers + payingMembers;
  const ratio = now > 0 ? payingMembers / now : 0.5;
  const at = (total: number) => {
    const m = Math.round(total * ratio);
    return pricesFor(e, total - m, m);
  };
  const high = now >= minPaying ? pricesFor(e, payingNonMembers, payingMembers) : at(minPaying);
  const low = at(Math.max(maxPaying, now));
  if (!high || !low) return null;
  return {
    nonMember: [Math.min(low.nonMember, high.nonMember), Math.max(low.nonMember, high.nonMember)],
    member: [Math.min(low.member, high.member), Math.max(low.member, high.member)],
    fixed: false,
  };
}

/** Whether the organiser has entered a price yet (a split total, or a price per girl). */
export function hasPrice(e: Pick<PricedEvent, "pricingMode" | "totalCost" | "priceNonMember">) {
  return e.pricingMode === "SPLIT" ? e.totalCost != null && e.totalCost > 0 : e.priceNonMember != null;
}

/** Only terms with one price for the whole court have a captain; a price per girl has none (simpler maths). */
export function canHaveCaptain(e: Pick<Event, "kind" | "pricingMode">) {
  return (e.kind === "WEEKLY" || e.kind === "SPECIAL") && e.pricingMode === "SPLIT";
}
