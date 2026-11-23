import { dateToSkopjeLocal, skopjeLocalToDate, weekKey } from "../time";
import type { Db } from "./common";

const day = (start: Date, plus: number, time: string) => {
  const d = new Date(`${dateToSkopjeLocal(start).slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return skopjeLocalToDate(`${d.toISOString().slice(0, 10)}T${time}`);
};

/**
 * One example month so the organiser can see how the site looks: four weekly terms and a fusion event,
 * all marked as examples. Partners are reused when they already exist.
 */
export async function addExampleEvents(db: Db, ownerId: string, now = new Date()) {
  await removeExampleEvents(db);
  const partner = async (name: string, activity: string, address?: string) =>
    (await db.partner.findFirst({ where: { name } })) ??
    db.partner.create({ data: { name, activity, address, example: true } });
  const pointer = await partner("Tennis Park Pointer", "Tennis & padel");
  const aerial = await partner("aerial movements", "Aerial, yoga & feel-good classes");
  const braka = await partner("Braka Ribar", "Football & volleyball");
  const miron = await partner("Miron winery", "Wine tasting", "Palmiro Toljati 88, Skopje 1000");
  // Start from the next Monday so the four weeks follow the rhythm.
  const dow = new Date(`${dateToSkopjeLocal(now).slice(0, 10)}T12:00:00Z`).getUTCDay() || 7;
  const monday = day(now, 8 - dow, "12:00");
  const base = { status: "APPROVED" as const, publishedAt: now, createdById: ownerId, example: true };
  const items = [
    { kind: "WEEKLY" as const, title: "Padel night", sport: "Padel", level: "Beginner", vibe: "ACTIVE", partnerId: pointer.id, startsAt: day(monday, 3, "19:00"), minSpots: 4, maxSpots: 8, pricingMode: "SPLIT" as const, totalCost: 2400, tagline: "Doubles for beginners, rackets on the spot" },
    { kind: "WEEKLY" as const, title: "Aerial for beginners", sport: "Aerial", vibe: "ACTIVE", partnerId: aerial.id, startsAt: day(monday, 9, "19:00"), minSpots: 4, maxSpots: 8, pricingMode: "PER_PERSON" as const, priceNonMember: 600 },
    { kind: "WEEKLY" as const, title: "Volleyball", sport: "Volleyball", level: "Intermediate", vibe: "ACTIVE", partnerId: braka.id, startsAt: day(monday, 17, "19:00"), minSpots: 8, maxSpots: 14, pricingMode: "SPLIT" as const, totalCost: 3000 },
    { kind: "SPECIAL" as const, title: "Surprise: vision board workshop", vibe: "SOCIAL", place: "Announced to the girls who sign up", startsAt: day(monday, 24, "18:30"), minSpots: 6, maxSpots: 16, pricingMode: "PER_PERSON" as const, priceNonMember: 500, tagline: "Coffee, magazines and plans for next year" },
    {
      kind: "FUSION" as const, title: "Sip & Serve", sport: "Tennis", vibe: "BOTH", partnerId: pointer.id, startsAt: day(monday, 12, "16:00"), minSpots: 10, maxSpots: 20,
      pricingMode: "ONLINE" as const, priceNonMember: 1800, priceMember: 1500, lockHours: 0,
      tagline: `Tennis & wine with ${miron.name}`,
      agenda: [["16:00", "Doubles on clay"], ["18:00", "Wine tasting"], ["19:30", "Long table dinner"]],
      description: "Example event: the real one will be announced on Instagram.",
    },
    {
      kind: "FUSION" as const, title: "Asanas & Mimosas", sport: "Yoga", vibe: "BOTH", partnerId: aerial.id, startsAt: day(monday, 34, "11:00"), minSpots: 10, maxSpots: 18,
      pricingMode: "ONLINE" as const, priceNonMember: 1800, priceMember: 1500, lockHours: 0,
      tagline: "Yoga, then brunch with mimosas",
      agenda: [["11:00", "Slow flow yoga"], ["12:15", "Brunch & mimosas"], ["13:30", "Goodie bags"]],
      description: "Example event: the real one will be announced on Instagram.",
    },
  ];
  for (const e of items) await db.event.create({ data: { ...base, ...e, weekKey: weekKey(e.startsAt) } });
  return items.length;
}

/** Removes every example event and the example partners that nothing else uses. */
export async function removeExampleEvents(db: Db) {
  const n = await db.event.deleteMany({ where: { example: true } });
  await db.partner.deleteMany({ where: { example: true, events: { none: {} } } });
  return n.count;
}
