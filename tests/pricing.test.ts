import { describe, expect, it } from "vitest";
import { ceil10, priceRange, splitPrices } from "@/lib/pricing";
import { skopjeLocalToDate, weekKey, dateToSkopjeLocal } from "@/lib/time";

describe("splitPrices (examples agreed in the business requirements)", () => {
  it("10 girls: captain + 6 members + 3 non-members on a 2.400 MKD term", () => {
    expect(splitPrices(2400, 3, 6)).toEqual({ nonMember: 310, member: 250 });
  });
  it("14 girls: captain + 9 members + 4 non-members", () => {
    expect(splitPrices(2400, 4, 9)).toEqual({ nonMember: 220, member: 180 });
  });
  it("one member did not come: 3 non-members + 5 members share the cost", () => {
    expect(splitPrices(2400, 3, 5)).toEqual({ nonMember: 350, member: 280 });
  });
  it("partner is always covered after rounding", () => {
    for (let non = 0; non < 12; non++)
      for (let mem = 0; mem < 12; mem++) {
        const p = splitPrices(2400, non, mem);
        if (!p) continue;
        expect(non * p.nonMember + mem * p.member).toBeGreaterThanOrEqual(2400);
      }
  });
  it("ceil10", () => {
    expect(ceil10(300)).toBe(300);
    expect(ceil10(300.01)).toBe(310);
  });
});

describe("priceRange", () => {
  const e = { kind: "WEEKLY", pricingMode: "SPLIT", totalCost: 2400, priceNonMember: null, priceMember: null, memberDiscountPct: 20, minSpots: 10, maxSpots: 14 } as const;
  it("shows 'as now' to 'if full' with the current member ratio", () => {
    const r = priceRange(e, 3, 6)!;
    expect(r.nonMember[1]).toBe(310);
    expect(r.member[1]).toBe(250);
    expect(r.nonMember[0]).toBeLessThan(310);
    expect(r.fixed).toBe(false);
  });
  it("uses the minimum when fewer are signed up", () => {
    const r = priceRange(e, 1, 1)!;
    // 9 paying at the minimum (10 incl. captain), half members: 4 or 5 non-members
    expect(r.nonMember[1]).toBeGreaterThanOrEqual(splitPrices(2400, 4, 5)!.nonMember);
  });
  it("per-person classes: members 20% less", () => {
    const r = priceRange({ ...e, pricingMode: "PER_PERSON", totalCost: null, priceNonMember: 600 }, 0, 0)!;
    expect(r).toEqual({ nonMember: [600, 600], member: [480, 480], fixed: true });
  });
});

describe("time", () => {
  it("Skopje local time round-trips (winter and summer)", () => {
    expect(skopjeLocalToDate("2026-12-01T19:00").toISOString()).toBe("2026-12-01T18:00:00.000Z");
    expect(skopjeLocalToDate("2026-07-01T19:00").toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(dateToSkopjeLocal(new Date("2026-12-01T18:00:00Z"))).toBe("2026-12-01T19:00");
  });
  it("weeks run Monday to Sunday in Skopje time", () => {
    expect(weekKey(skopjeLocalToDate("2026-11-30T08:00"))).toBe("2026-W49");
    expect(weekKey(skopjeLocalToDate("2026-12-06T23:30"))).toBe("2026-W49");
    expect(weekKey(skopjeLocalToDate("2026-12-07T00:30"))).toBe("2026-W50");
  });
});
