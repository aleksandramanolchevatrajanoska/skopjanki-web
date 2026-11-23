/**
 * Starting data: the partners from the business requirements and one example month.
 * Safe to run once on an empty database: `npm run db:seed`.
 */
import { PrismaClient } from "@prisma/client";
import { skopjeLocalToDate, weekKey } from "../lib/time";

const db = new PrismaClient();

async function main() {
  const ownerEmail = (process.env.OWNER_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  if (!ownerEmail) throw new Error("Set OWNER_EMAILS first");
  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    create: { email: ownerEmail, name: "Organiser", status: "APPROVED", isOwner: true, approvedAt: new Date() },
    update: { isOwner: true, status: "APPROVED" },
  });
  if ((await db.partner.count()) > 0) {
    console.log("Partners already exist, skipping example data.");
    return;
  }
  const pointer = await db.partner.create({ data: { name: "Tennis Park Pointer", activity: "Tennis & padel", notes: "To confirm: price per court, discount, min/max" } });
  const aerial = await db.partner.create({ data: { name: "aerial movements", activity: "Aerial, yoga & feel-good classes", notes: "To confirm: price per girl, member price" } });
  const braka = await db.partner.create({ data: { name: "Braka Ribar", activity: "Football & volleyball", notes: "To confirm" } });
  await db.partner.create({ data: { name: "Miron winery", activity: "Wine tasting (fusion)", address: "Palmiro Toljati 88, Skopje 1000", notes: "Address to confirm" } });

  const now = new Date();
  const ev = (local: string, data: Record<string, unknown>) => {
    const startsAt = skopjeLocalToDate(local);
    return db.event.create({
      data: { startsAt, weekKey: weekKey(startsAt), status: "APPROVED", publishedAt: now, createdById: owner.id, ...data } as never,
    });
  };
  await ev("2026-12-03T19:00", { kind: "WEEKLY", title: "Padel night", sport: "Padel", partnerId: pointer.id, minSpots: 4, maxSpots: 8, pricingMode: "SPLIT", totalCost: 2400 });
  await ev("2026-12-10T19:00", { kind: "WEEKLY", title: "Aerial for beginners", sport: "Aerial", partnerId: aerial.id, minSpots: 4, maxSpots: 8, pricingMode: "PER_PERSON", priceNonMember: 600 });
  await ev("2026-12-17T19:00", { kind: "WEEKLY", title: "Volleyball", sport: "Volleyball", partnerId: braka.id, minSpots: 8, maxSpots: 14, pricingMode: "SPLIT", totalCost: 3000 });
  await ev("2026-12-24T18:30", { kind: "SPECIAL", title: "Surprise: holiday workshop", minSpots: 6, maxSpots: 16, pricingMode: "PER_PERSON", priceNonMember: 500, place: "Announced to the girls who sign up" });
  await ev("2026-12-13T11:00", {
    kind: "FUSION", title: "Asanas & Mimosas", description: "Yoga, then brunch with mimosas.", minSpots: 10, maxSpots: 20,
    pricingMode: "ONLINE", priceNonMember: 1800, priceMember: 1500, lockHours: 0,
  });
  console.log("Seeded partners and an example month.");
}

main().finally(() => db.$disconnect());
