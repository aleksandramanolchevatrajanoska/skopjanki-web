import { beforeEach, describe, expect, it } from "vitest";
import { db, girl, reset, T0, weekly } from "./helpers";
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

describe("import from Instagram (official API)", () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const res = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, headers: { get: () => "application/json" }, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
  const img = { ok: true, status: 200, headers: { get: () => "image/jpeg" }, json: async () => ({}), arrayBuffer: async () => jpg.buffer.slice(jpg.byteOffset, jpg.byteOffset + jpg.length) as ArrayBuffer };
  const album = { id: "m1", caption: "Sip & Serve 🎾🍷\n#skopjanki", media_type: "CAROUSEL_ALBUM", permalink: "https://www.instagram.com/p/abc/", timestamp: "2026-10-23T18:00:00+0000",
    children: { data: [{ id: "c1", media_type: "IMAGE", media_url: "https://cdn/c1.jpg" }, { id: "c2", media_type: "VIDEO", thumbnail_url: "https://cdn/c2.jpg" }] } };
  const fake = async (url: string) => {
    if (url.startsWith("https://cdn/")) return img;
    if (url.includes("/me?")) return url.includes("bad") ? res({ error: { message: "Invalid OAuth access token" } }, false) : res({ id: "1", username: "skopjankii" });
    if (url.includes("/me/media")) return res({ data: [album], paging: {} });
    if (url.includes("/m1?")) return res(album);
    return res({ error: { message: "x" } }, false);
  };

  it("connects with a valid token, lists posts and imports a carousel as a past event with all photos, once", async () => {
    const ig = await import("@/lib/services/instagram");
    const owner = await girl({ owner: true });
    expect(await code(ig.saveInstagramToken(db, "bad-token-123456789012345", fake))).toBe("INSTAGRAM_TOKEN");
    expect(await ig.saveInstagramToken(db, "good-token-123456789012345", fake)).toBe("skopjankii");
    const list = await ig.listInstagramPosts(db, null, fake);
    expect(list.posts[0].images.map((i) => i.id)).toEqual(["c1", "c2"]);
    const r = await ig.importInstagramPosts(db, owner.id, [{ mediaId: "m1", target: "new", kind: "FUSION" }], fake);
    expect(r[0]).toMatchObject({ status: "imported", photos: 2, title: "Sip & Serve 🎾🍷" });
    const e = await db.event.findFirstOrThrow({ where: { sourceUrl: "https://www.instagram.com/p/abc/" }, include: { photos: true, poster: true } });
    expect(e.photos.every((p) => p.public)).toBe(true);
    expect(e.poster?.mime).toBe("image/jpeg");
    expect((await ig.importInstagramPosts(db, owner.id, [{ mediaId: "m1", target: "new", kind: "FUSION" }], fake))[0].status).toBe("skipped");
    expect((await ig.listInstagramPosts(db, null, fake)).posts[0].imported).toBe(true);
  });
});

describe("editing events", () => {
  it("organiser, captain and proposer can edit; others cannot; girls hear about a new time; the lock survives a text edit", async () => {
    const { editEvent } = await import("@/lib/services/events");
    const { reserve } = await import("@/lib/services/reservations");
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const captain = await girl({ member: true });
    const other = await girl({ member: true });
    await db.event.update({ where: { id: e.id }, data: { captainId: captain.id, lockedAt: new Date(), lockedPriceMember: 250, lockedPriceNonMember: 310 } });
    await reserve(db, other.id, e.id, T0);
    const input = { kind: "WEEKLY" as const, title: "Padel night", description: "Bring water", startsAt: e.startsAt, minSpots: e.minSpots, maxSpots: e.maxSpots, pricingMode: "SPLIT" as const, totalCost: 2400 };
    expect(await code(editEvent(db, other.id, e.id, input))).toBe("FORBIDDEN");
    await editEvent(db, captain.id, e.id, { ...input, kind: "FUSION" });
    const kept = await db.event.findUniqueOrThrow({ where: { id: e.id } });
    expect([kept.kind, kept.description, kept.lockedPriceMember]).toEqual(["WEEKLY", "Bring water", 250]);
    const later = new Date(e.startsAt.getTime() + 3600_000);
    await editEvent(db, owner.id, e.id, { ...input, startsAt: later });
    expect((await db.event.findUniqueOrThrow({ where: { id: e.id } })).lockedAt).toBeNull();
    const mails = await db.emailLog.findMany({ where: { subject: "Changed: Padel night" } });
    expect(mails.map((m) => m.to)).toEqual([other.email]);
    expect(await db.emailLog.count({ where: { subject: { contains: "edited: Padel night" } } })).toBe(1);
  });

  it("the member who proposed a plan can edit it", async () => {
    const { editEvent, proposePlan } = await import("@/lib/services/events");
    await girl({ owner: true });
    const m = await girl({ member: true });
    const plan = { title: "Run", startsAt: new Date(T0.getTime() + 3 * 86400_000), minSpots: 2, maxSpots: 8, pricingMode: "PER_PERSON" as const, priceNonMember: 0 };
    const p = await proposePlan(db, m.id, plan, T0);
    await editEvent(db, m.id, p.id, { ...plan, kind: "MEMBER_PLAN", title: "Sunrise run" });
    expect((await db.event.findUniqueOrThrow({ where: { id: p.id } })).title).toBe("Sunrise run");
  });
});

describe("event photos and videos", () => {
  it("reads Instagram, YouTube and TikTok links and ignores the rest", async () => {
    const { toEmbed, cleanVideoLinks } = await import("@/lib/embeds");
    expect(toEmbed("https://www.instagram.com/reel/DAbc_12-x/?igsh=1")?.embedUrl).toBe("https://www.instagram.com/reel/DAbc_12-x/embed");
    expect(toEmbed("https://instagram.com/p/XyZ123/")?.url).toBe("https://www.instagram.com/p/XyZ123/");
    expect(toEmbed("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbed("https://www.youtube.com/shorts/abcDEF12345")?.portrait).toBe(true);
    expect(toEmbed("https://www.tiktok.com/@skopjankii/video/7300000000000000000")?.kind).toBe("tiktok");
    expect(toEmbed("https://example.com/video.mp4")).toBeNull();
    expect(toEmbed("javascript:alert(1)")).toBeNull();
    expect(cleanVideoLinks(["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "nope"])).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });

  it("the organiser and captain add photos before the event; a girl only after she came", async () => {
    const { canAddPhotos } = await import("@/lib/services/club");
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const cap = await girl({ member: true });
    const g = await girl();
    await db.event.update({ where: { id: e.id }, data: { captainId: cap.id } });
    expect(await canAddPhotos(db, owner.id, e.id, T0)).toBe(true);
    expect(await canAddPhotos(db, cap.id, e.id, T0)).toBe(true);
    expect(await canAddPhotos(db, g.id, e.id, T0)).toBe(false);
  });
});

describe("captain's desk: girls added by hand and notes", () => {
  it("only the captain or organiser adds a girl by hand, and she counts in the price split", async () => {
    const { addGuest } = await import("@/lib/services/eventdesk");
    const { saveAttendance } = await import("@/lib/services/attendance");
    const owner = await girl({ owner: true });
    const other = await girl();
    const ev = await weekly(owner.id, { startsAt: new Date(T0.getTime() + 2 * 3600_000) });
    expect(await code(addGuest(db, other.id, ev.id, { name: "Ana" }))).toBe("FORBIDDEN");
    const g = await addGuest(db, owner.id, ev.id, { name: " Ana ", phone: "070", isMember: false });
    expect(g.name).toBe("Ana");
    const without = await saveAttendance(db, owner.id, ev.id, [], T0);
    const withHer = await saveAttendance(db, owner.id, ev.id, [`guest:${g.id}`], T0);
    expect(withHer).not.toBeNull();
    if (without && withHer) expect(withHer.nonMember).toBeLessThanOrEqual(without.nonMember);
    expect((await db.eventGuest.findUniqueOrThrow({ where: { id: g.id } })).attended).toBe(true);
  });

  it("notes are seen by the author, the captain and the organiser only", async () => {
    const { addNote, notesFor } = await import("@/lib/services/eventdesk");
    const { reserve } = await import("@/lib/services/reservations");
    const owner = await girl({ owner: true });
    const a = await girl();
    const b = await girl();
    const stranger = await girl();
    const ev = await weekly(owner.id);
    await reserve(db, a.id, ev.id, T0);
    await reserve(db, b.id, ev.id, T0);
    expect(await code(addNote(db, stranger.id, ev.id, "hi"))).toBe("FORBIDDEN");
    await addNote(db, a.id, ev.id, "I'll be 10 minutes late");
    await addNote(db, b.id, ev.id, "Bringing a racket");
    expect((await notesFor(db, owner.id, ev.id)).length).toBe(2);
    expect((await notesFor(db, a.id, ev.id)).map((n) => n.body)).toEqual(["I'll be 10 minutes late"]);
  });
});

describe("points and club movement", () => {
  it("counts terms she came to, captain bonus, hours and km", async () => {
    const { myPoints, clubMovement } = await import("@/lib/services/points");
    const owner = await girl({ owner: true });
    const a = await girl();
    const ev = await weekly(owner.id, { sport: "Tennis", startsAt: new Date(T0.getTime() - 2 * 86400_000) });
    await db.reservation.create({ data: { eventId: ev.id, userId: a.id, status: "CONFIRMED", isMember: false, attended: true } });
    await db.event.update({ where: { id: ev.id }, data: { captainId: a.id } });
    const p = await myPoints(db, a.id, T0);
    expect(p).toMatchObject({ events: 1, captained: 1, points: 15, hours: 1.5 });
    expect(p.km).toBeGreaterThan(0);
    expect((await clubMovement(db, T0)).visits).toBe(1);
  });
});

describe("partner form", () => {
  it("keeps prices per sport and any number of days and hours", async () => {
    const { submitPartnerApplication, partnerDealLines } = await import("@/lib/services/partners");
    await girl({ owner: true });
    const app = await submitPartnerApplication(db, {
      business: "Pointer", kind: "Спортски терен", person: "Marko", phone: "070", email: "p@example.com", sports: [],
      offers: ["discount_session"], discountPct: 20, hostWeekly: false, hostFusion: false, days: [], consent: true,
      sportRows: JSON.stringify([
        { sport: "Тенис", priceRegular: "1600", priceGroup: "1300", durationMin: "90", pricing: "по терен", minGirls: "2", maxGirls: "4", units: "2" },
        { sport: "Падел", priceRegular: "2000", priceGroup: "", minGirls: "4", maxGirls: "8" },
        { sport: "" }, "junk",
      ]),
      slots: JSON.stringify([{ day: "Вторник", from: "19:00", to: "21:00" }, { day: "Вторник", from: "08:00", to: "" }, { day: "Funday" }]),
    });
    expect(app.sports).toEqual(["Тенис", "Падел"]);
    expect(app.days).toEqual(["Вторник"]);
    const lines = partnerDealLines(app);
    expect(lines[0]).toContain("Тенис: redovno 1600 MKD za Skopjanki 1300 MKD");
    expect(lines[1]).toContain("4–8 devojki");
    expect(lines.at(-1)).toBe("Termini za Skopjanki: Вторник 19:00–21:00, Вторник 08:00");
  });
});

describe("club numbers never show zero", () => {
  it("uses the events from before the site, then estimates past events nobody signed up to", async () => {
    const { clubMovement } = await import("@/lib/services/points");
    const empty = await clubMovement(db, T0);
    expect(empty.eventsHeld).toBe(2);
    expect(empty.playHours).toBeGreaterThan(0);
    expect(empty.socialHours).toBeGreaterThan(0);
    expect(empty.km).toBeGreaterThan(0);
    const owner = await girl({ owner: true });
    const ev = await weekly(owner.id, { sport: "Football", startsAt: new Date(T0.getTime() - 3 * 86400_000) });
    await db.event.update({ where: { id: ev.id }, data: { minSpots: 10 } });
    const one = await clubMovement(db, T0);
    expect(one).toMatchObject({ eventsHeld: 1, visits: 10, playHours: 15, socialHours: 0 });
  });
});

describe("partner applications are never lost", () => {
  it("saves even when the hidden field is filled, and emails the organiser and the partner", async () => {
    const { submitPartnerApplication } = await import("@/lib/services/partners");
    const owner = await girl({ owner: true });
    const app = await submitPartnerApplication(db, {
      business: "Vinarija", kind: "Винарија", person: "Ana", phone: "070", email: "vino@example.com", sports: [],
      offers: ["gifts"], hostWeekly: false, hostFusion: true, days: [], consent: true, suspect: true,
    });
    expect(await db.partnerApplication.count()).toBe(1);
    expect(app.message).toContain("можеби спам");
    const mails = await db.emailLog.findMany();
    const toOwner = mails.find((m) => m.to.split(",").includes(owner.email));
    expect(toOwner?.body).toContain("Сакаат да бидат домаќин на fusion настан.");
    expect(mails.some((m) => m.to === "vino@example.com")).toBe(true);
  });
});

describe("deleting a partner", () => {
  it("keeps the place name on its events and removes the partner", async () => {
    const { deletePartner } = await import("@/lib/services/partners");
    const owner = await girl({ owner: true });
    const p = await db.partner.create({ data: { name: "Old Club", activity: "Tennis", address: "Centar" } });
    const ev = await weekly(owner.id);
    await db.event.update({ where: { id: ev.id }, data: { partnerId: p.id, place: null } });
    await deletePartner(db, p.id);
    expect(await db.partner.count({ where: { id: p.id } })).toBe(0);
    const after = await db.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(after.partnerId).toBeNull();
    expect(after.place).toBe("Old Club, Centar");
  });
});
