import { beforeEach, describe, expect, it } from "vitest";
import { db, girl, reset, weekly } from "./helpers";
import { parseAgenda } from "@/lib/services/events";
import { clubStats, eventMatches, setPoster } from "@/lib/services/club";

const code = (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code ?? String(e));
beforeEach(reset);

describe("agenda", () => {
  it("reads one line per slot, with or without a time", () => {
    expect(parseAgenda("11:00 Yoga\n12.30 - Brunch & mimosas\n\nGoodie bags")).toEqual([
      ["11:00", "Yoga"],
      ["12:30", "Brunch & mimosas"],
      ["", "Goodie bags"],
    ]);
  });
});

describe("active or social filter", () => {
  const e = (vibe: string | null) => ({ title: "x", sport: null, level: null, kind: "WEEKLY", vibe, place: null, partner: null });
  it("Active + Social shows under both", () => {
    expect(eventMatches(e("BOTH"), { vibe: "ACTIVE" }, {})).toBe(true);
    expect(eventMatches(e("BOTH"), { vibe: "SOCIAL" }, {})).toBe(true);
    expect(eventMatches(e("SOCIAL"), { vibe: "ACTIVE" }, {})).toBe(false);
    expect(eventMatches(e(null), { vibe: "SOCIAL" }, {})).toBe(false);
  });
});

describe("posters and club numbers", () => {
  it("accepts a real image, refuses a renamed file", async () => {
    const owner = await girl({ owner: true });
    const ev = await weekly(owner.id, { tagline: "Tennis & wine", agenda: [["18:00", "Tennis"]], vibe: "BOTH" });
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    expect(await code(setPoster(db, ev.id, "image/png", png))).toBe("OK");
    expect(await code(setPoster(db, ev.id, "image/png", Buffer.from("not an image")))).toBe("PHOTO_TYPE");
    const saved = await db.event.findUniqueOrThrow({ where: { id: ev.id }, include: { poster: true } });
    expect([saved.tagline, saved.vibe, saved.agenda, saved.poster?.mime]).toEqual(["Tennis & wine", "BOTH", [["18:00", "Tennis"]], "image/png"]);
    expect(await clubStats(db)).toEqual({ girls: 1, plans: 1, partners: 0 });
  });
});

describe("example events", () => {
  it("adds a month of examples and removes them, keeping real partners", async () => {
    const { addExampleEvents, removeExampleEvents } = await import("@/lib/services/examples");
    const owner = await girl({ owner: true });
    const real = await db.partner.create({ data: { name: "Tennis Park Pointer", activity: "Tennis" } });
    expect(await addExampleEvents(db, owner.id)).toBe(6);
    expect(await db.event.count({ where: { example: true, partnerId: real.id } })).toBe(2);
    await addExampleEvents(db, owner.id); // again: replaces, does not double
    expect(await db.event.count()).toBe(6);
    await removeExampleEvents(db);
    expect(await db.event.count()).toBe(0);
    expect(await db.partner.findMany({ select: { name: true } })).toEqual([{ name: "Tennis Park Pointer" }]);
  });
});
