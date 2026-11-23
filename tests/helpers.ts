import { prisma } from "@/lib/db";
import { createEvent, type EventInput } from "@/lib/services/events";
import { DAY, HOUR } from "@/lib/time";

export const db = prisma;
export const T0 = new Date("2026-12-01T10:00:00Z"); // a Tuesday

/** Empties the TEST database (DATABASE_URL points at skopjanki_test in vitest.config.ts). */
export async function reset() {
  if (!(process.env.DATABASE_URL ?? "").includes("test")) throw new Error("Refusing to truncate a non-test database");
  await db.$executeRawUnsafe(
    `TRUNCATE "PartnerApplication","EmailLog","Debt","CaptainApplication","Reservation","Event","Partner","Session","LoginToken","User" CASCADE`,
  );
}

let n = 0;
export async function girl(opts: { member?: boolean; owner?: boolean; status?: "APPROVED" | "PENDING"; credit?: number } = {}) {
  n++;
  return db.user.create({
    data: {
      email: `girl${n}@test.mk`,
      name: `Girl ${n}`,
      status: opts.status ?? "APPROVED",
      isOwner: opts.owner ?? false,
      memberUntil: opts.member ? new Date(T0.getTime() + 60 * DAY) : null,
      creditBalance: opts.credit ?? 0,
    },
  });
}

export async function weekly(ownerId: string, over: Partial<EventInput> = {}, publishedAt = new Date(T0.getTime() - 3 * DAY)) {
  return createEvent(
    db,
    ownerId,
    {
      kind: "WEEKLY",
      title: "Padel at Pointer",
      startsAt: new Date(T0.getTime() + 5 * DAY),
      minSpots: 10,
      maxSpots: 14,
      pricingMode: "SPLIT",
      totalCost: 2400,
      ...over,
    },
    publishedAt,
  );
}

export const hours = (h: number) => new Date(T0.getTime() + h * HOUR);
