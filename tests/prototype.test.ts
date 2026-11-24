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

describe("weekly letter", () => {
  it("goes on Monday to every approved girl who did not opt out, with the week's events and the thought, once", async () => {
    const { sendWeekly, isWeeklySendTime, composeWeekly } = await import("@/lib/services/weekly");
    const { weekKey } = await import("@/lib/time");
    const monday = new Date("2026-11-30T08:30:00Z"); // 09:30 in Skopje
    expect(isWeeklySendTime(monday)).toBe(true);
    expect(isWeeklySendTime(new Date("2026-11-30T05:00:00Z"))).toBe(false); // 06:00 Skopje
    expect(isWeeklySendTime(new Date("2026-12-01T09:00:00Z"))).toBe(false); // Tuesday
    const owner = await girl({ owner: true });
    await girl();
    const out = await girl();
    await db.user.update({ where: { id: out.id }, data: { newsletterOptOut: true } });
    await girl({ status: "PENDING" });
    await weekly(owner.id, { title: "Padel night", startsAt: new Date("2026-12-02T18:00:00Z") });
    await db.weeklyLetter.create({ data: { weekKey: weekKey(monday), title: "Кажи не", body: "Една мисла." } });
    const mail = await composeWeekly(db, "mk", monday);
    expect(mail.text).toContain("Padel night");
    expect(mail.text).toContain("Една мисла.");
    expect(mail.subject).toBe("Skopjanki · Кажи не");
    expect(await sendWeekly(db, monday)).toEqual({ sent: 2, skipped: false });
    expect(await sendWeekly(db, monday)).toEqual({ sent: 0, skipped: true });
    const to = (await db.emailLog.findMany({ where: { subject: { startsWith: "Skopjanki ·" } } })).map((m) => m.to);
    expect(to).not.toContain(out.email);
  });
});

describe("join as captain", () => {
  it("a member gets a seat and a captain request in one go; a non-member cannot", async () => {
    const { reserve } = await import("@/lib/services/reservations");
    const { applyCaptain } = await import("@/lib/services/captains");
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const m = await girl({ member: true });
    await reserve(db, m.id, e.id);
    await applyCaptain(db, m.id, e.id);
    expect((await db.reservation.findFirstOrThrow({ where: { userId: m.id } })).status).toBe("CONFIRMED");
    expect((await db.captainApplication.findFirstOrThrow({ where: { userId: m.id } })).status).toBe("PENDING");
    const free = await girl();
    expect(await code(applyCaptain(db, free.id, e.id))).toBe("MEMBERS_ONLY");
  });
});

describe("member plans need a picture", () => {
  it("refuses a plan without a picture or with a fake one, saves it with a real one", async () => {
    const { proposePlanWithPoster } = await import("@/lib/services/club");
    await girl({ owner: true });
    const m = await girl({ member: true });
    const plan = { title: "Running", startsAt: new Date(Date.now() + 3 * 86400_000), minSpots: 2, maxSpots: 8, pricingMode: "PER_PERSON" as const, priceNonMember: 0 };
    expect(await code(proposePlanWithPoster(db, m.id, plan, null))).toBe("POSTER_REQUIRED");
    expect(await code(proposePlanWithPoster(db, m.id, plan, { mime: "image/png", data: Buffer.from("nope") }))).toBe("PHOTO_TYPE");
    expect(await db.event.count()).toBe(0);
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const e = await proposePlanWithPoster(db, m.id, plan, { mime: "image/png", data: png });
    expect((await db.eventPoster.findUniqueOrThrow({ where: { eventId: e.id } })).mime).toBe("image/png");
  });
});

describe("import from Luma", () => {
  const page = (title: string, date: string) => `<html><head><meta property="og:title" content="${title} · Luma">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"${title}","startDate":"${date}","location":{"@type":"Place","name":"Tennis Park Pointer","address":{"@type":"PostalAddress","streetAddress":"Bul. Ilinden","addressLocality":"Skopje"}},"image":["https://images.lumacdn.com/cover.png"],"description":"Tennis &amp; wine","maximumAttendeeCapacity":18}</script></head></html>`;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const fake = async (url: string) => {
    if (url.includes("lumacdn")) return { ok: true, status: 200, headers: { get: () => "image/png" }, text: async () => "", arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.length) as ArrayBuffer };
    if (url.endsWith("/sip")) return { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => page("Sip & Serve", "2026-10-23T16:00:00.000+02:00"), arrayBuffer: async () => new ArrayBuffer(0) };
    if (url.endsWith("/nodate")) return { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => "<meta property='og:title' content='X'>", arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
  };

  it("creates the event with place, capacity, poster and a public Moments photo; skips duplicates and bad links", async () => {
    const { importFromLuma } = await import("@/lib/services/importer");
    const owner = await girl({ owner: true });
    const r = await importFromLuma(db, owner.id, ["https://lu.ma/sip", "https://lu.ma/sip?tk=1", "https://lu.ma/nodate", "https://example.com/x", "https://lu.ma/gone"], "FUSION", fake);
    expect(r.map((x) => x.status)).toEqual(["created", "exists", "failed", "failed", "failed"]);
    const e = await db.event.findFirstOrThrow({ where: { sourceUrl: "https://lu.ma/sip" }, include: { poster: true, photos: true } });
    expect([e.title, e.place, e.maxSpots, e.description, e.kind]).toEqual(["Sip & Serve", "Tennis Park Pointer, Bul. Ilinden, Skopje", 18, "Tennis & wine", "FUSION"]);
    expect(e.poster?.mime).toBe("image/png");
    expect(e.photos.map((p) => p.public)).toEqual([true]);
    expect((await importFromLuma(db, owner.id, ["https://lu.ma/sip"], "FUSION", fake))[0].status).toBe("exists");
  });
});
