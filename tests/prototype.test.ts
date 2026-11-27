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

  it("only the organiser adds photos; captains and girls do not", async () => {
    const { canAddPhotos } = await import("@/lib/services/club");
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id);
    const cap = await girl({ member: true });
    const g = await girl();
    await db.event.update({ where: { id: e.id }, data: { captainId: cap.id } });
    expect(await canAddPhotos(db, owner.id, e.id, T0)).toBe(true);
    expect(await canAddPhotos(db, cap.id, e.id, T0)).toBe(false);
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

  it("the event chat is read and written by the girls signed up, the captain and the organiser", async () => {
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
    expect((await notesFor(db, a.id, ev.id)).map((n) => n.body)).toEqual(["I'll be 10 minutes late", "Bringing a racket"]);
    expect(await notesFor(db, stranger.id, ev.id)).toEqual([]);
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
    expect(one).toMatchObject({ eventsHeld: 1, visits: 11, playHours: 1.5, socialHours: 0, km: 50 });
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

describe("personal invitations", () => {
  it("keeps only a clean name and saves the letter and list", async () => {
    const { cleanName, saveInviteSettings, inviteSettings } = await import("@/lib/services/invites");
    expect(cleanName("  Ана<script>alert(1)</script> ")).toBe("Анаscriptalertscript");
    expect(cleanName("Марија-Елена")).toBe("Марија-Елена");
    await saveInviteSettings(db, "Мое писмо.", "Ана\n\n  Теона  \n");
    expect(await inviteSettings(db)).toEqual({ letter: "Мое писмо.", names: ["Ана", "Теона"] });
  });
});

describe("workshops led by members", () => {
  const png = { mime: "image/png", data: Buffer.from("89504e470d0a1a0a0000000d49484452", "hex") };
  const input = (over = {}) => ({
    title: "Make-up basics", startsAt: new Date(T0.getTime() + 5 * 86400_000), minSpots: 3, maxSpots: 10,
    pricingMode: "PER_PERSON" as const, priceNonMember: 1000, memberDiscountPct: 20, ...over,
  });

  it("needs a price per girl, and the host owes the club its share of what came in", async () => {
    const { proposeWorkshop, workshopCommission, setCommissionPct } = await import("@/lib/services/workshops");
    const { saveAttendance } = await import("@/lib/services/attendance");
    await girl({ owner: true });
    const host = await girl({ member: true });
    expect(await code(proposeWorkshop(db, host.id, input({ pricingMode: "SPLIT", totalCost: 3000, priceNonMember: null }), png, T0))).toBe("WORKSHOP_PRICE");
    await setCommissionPct(db, 15);
    const ev = await proposeWorkshop(db, host.id, input(), png, T0);
    expect(ev).toMatchObject({ workshop: true, commissionPct: 15, captainId: host.id, status: "PENDING" });
    await db.event.update({ where: { id: ev.id }, data: { status: "APPROVED" } });
    const a = await girl({ member: true });
    const b = await girl();
    await db.reservation.createMany({ data: [
      { eventId: ev.id, userId: a.id, status: "CONFIRMED", isMember: true },
      { eventId: ev.id, userId: b.id, status: "CONFIRMED", isMember: false },
    ] });
    const before = await workshopCommission(db, ev.id);
    expect(before).toMatchObject({ girls: 2, collected: 1800, owed: 270, final: false });
    await saveAttendance(db, host.id, ev.id, [a.id], new Date(ev.startsAt.getTime() + 3600_000));
    expect(await workshopCommission(db, ev.id)).toMatchObject({ girls: 1, collected: 800, owed: 120, final: true });
  });

  it("the Workshops filter shows only workshops", () => {
    const base = { title: "x", sport: null, level: null, kind: "MEMBER_PLAN", place: null, partner: null };
    expect(eventMatches({ ...base, workshop: true }, { kind: "WORKSHOP" }, {})).toBe(true);
    expect(eventMatches({ ...base, workshop: false }, { kind: "WORKSHOP" }, {})).toBe(false);
  });
});

describe("member businesses", () => {
  it("only paying members list a business, at most two, and it waits for approval", async () => {
    const { submitBusiness, decideBusiness } = await import("@/lib/services/businesses");
    await girl({ owner: true });
    const free = await girl();
    const m = await girl({ member: true });
    expect(await code(submitBusiness(db, free.id, { name: "Shop", category: "Jewellery" }))).toBe("MEMBERS_ONLY");
    const b = await submitBusiness(db, m.id, { name: "Shop", category: "Jewellery", instagram: "@shop", offer: "15% off" });
    expect(b).toMatchObject({ status: "PENDING", instagram: "shop" });
    await submitBusiness(db, m.id, { name: "Two", category: "Cafe" });
    expect(await code(submitBusiness(db, m.id, { name: "Three", category: "Cafe" }))).toBe("BUSINESS_LIMIT");
    expect((await decideBusiness(db, b.id, true)).status).toBe("APPROVED");
  });
});

describe("estimating past events run before the site", () => {
  it("uses the event's size, never one girl", async () => {
    const { estimateGirls } = await import("@/lib/services/points");
    expect(estimateGirls({ kind: "FUSION", minSpots: 1, maxSpots: 1 })).toBe(10);
    expect(estimateGirls({ kind: "FUSION", minSpots: 1, maxSpots: 20 })).toBe(15);
    expect(estimateGirls({ kind: "WEEKLY", minSpots: 6, maxSpots: 8 })).toBe(6);
  });
});

describe("joining with interests, skills and background", () => {
  it("keeps what she tells us and drops an unknown background", async () => {
    const { requestJoin } = await import("@/lib/services/users");
    await requestJoin(db, { name: "Ana", email: "ana@example.com", levels: {}, locale: "mk", topics: ["health"], skills: " фотографија ", background: "creative", businessNote: "Накит @ana.nakit" });
    await requestJoin(db, { name: "Bea", email: "bea@example.com", levels: {}, locale: "mk", background: "astronaut" });
    const ana = await db.user.findUniqueOrThrow({ where: { email: "ana@example.com" } });
    expect(ana).toMatchObject({ topics: ["health"], skills: "фотографија", background: "creative", businessNote: "Накит @ana.nakit" });
    expect((await db.user.findUniqueOrThrow({ where: { email: "bea@example.com" } })).background).toBeNull();
  });
});

describe("participants managed by the captain or organiser", () => {
  it("adds a girl from the club and removes one without a debt; others cannot", async () => {
    const { addParticipant, removeParticipant } = await import("@/lib/services/eventdesk");
    const owner = await girl({ owner: true });
    const a = await girl({ member: true });
    const other = await girl();
    const ev = await weekly(owner.id);
    expect(await code(addParticipant(db, other.id, ev.id, a.id))).toBe("FORBIDDEN");
    const r = await addParticipant(db, owner.id, ev.id, a.id);
    expect(r).toMatchObject({ status: "CONFIRMED", isMember: true });
    await db.debt.create({ data: { userId: a.id, eventId: ev.id, amount: 300, reason: "NO_SHOW" } });
    await removeParticipant(db, owner.id, ev.id, a.id);
    expect((await db.reservation.findUniqueOrThrow({ where: { eventId_userId: { eventId: ev.id, userId: a.id } } })).status).toBe("CANCELLED");
    expect(await db.debt.count({ where: { userId: a.id, eventId: ev.id } })).toBe(0);
  });
});

describe("hours are the length of the events", () => {
  it("does not multiply hours by the girls; km are per girl", async () => {
    const { clubMovement } = await import("@/lib/services/points");
    const empty = await clubMovement(db, T0);
    expect(empty).toMatchObject({ eventsHeld: 2, playHours: 3, socialHours: 6, km: 117 });
    const owner = await girl({ owner: true });
    const ev = await weekly(owner.id, { startsAt: new Date(T0.getTime() - 86400_000), durationMin: 60 });
    await db.event.update({ where: { id: ev.id }, data: { minSpots: 8, maxSpots: 8 } });
    expect(await clubMovement(db, T0)).toMatchObject({ eventsHeld: 1, playHours: 1, socialHours: 0, km: 24 });
  });
});

describe("community search", () => {
  it("ignores case, matches Cyrillic and Latin, and needs every word", async () => {
    const { matchesQuery } = await import("@/lib/services/club");
    const text = "Марија Фотографија, сметководство Креативна индустрија Здравје health";
    expect(matchesQuery(text, "ФОТО")).toBe(true);
    expect(matchesQuery(text, "fotografija")).toBe(true);
    expect(matchesQuery(text, "smetkovodstvo zdravje")).toBe(true);
    expect(matchesQuery(text, "HEALTH")).toBe(true);
    expect(matchesQuery(text, "јога")).toBe(false);
    expect(matchesQuery("Ana Čolić", "colik")).toBe(true);
    expect(matchesQuery("Ана Чолиќ", "cholikj")).toBe(true);
    expect(matchesQuery("Шпански", "spanski")).toBe(true);
  });
});

describe("chat replies", () => {
  it("a reply hangs under its message, a reply to a reply joins the same thread, and deleting the message removes its replies", async () => {
    const { addNote, deleteNote } = await import("@/lib/services/eventdesk");
    const owner = await girl({ owner: true });
    const a = await girl();
    const ev = await weekly(owner.id);
    const other = await weekly(owner.id, { title: "Other" });
    await db.reservation.create({ data: { eventId: ev.id, userId: a.id, status: "CONFIRMED", isMember: false } });
    const m = await addNote(db, a.id, ev.id, "Кој носи топка?");
    const r1 = await addNote(db, owner.id, ev.id, "Јас", m.id);
    const r2 = await addNote(db, a.id, ev.id, "Супер", r1.id);
    expect(r1.parentId).toBe(m.id);
    expect(r2.parentId).toBe(m.id);
    expect(await code(addNote(db, owner.id, other.id, "x", m.id))).toBe("NOT_FOUND");
    await deleteNote(db, a.id, m.id);
    expect(await db.eventNote.count({ where: { eventId: ev.id } })).toBe(0);
  });
});

describe("asking to become a member", () => {
  it("emails the organiser once a day and clears when she becomes a member", async () => {
    const { requestMembership, setMembership } = await import("@/lib/services/users");
    const owner = await girl({ owner: true });
    const a = await girl();
    await requestMembership(db, a.id, T0);
    await requestMembership(db, a.id, new Date(T0.getTime() + 3600_000));
    const mails = await db.emailLog.findMany({ where: { subject: { contains: "сака членство" } } });
    expect(mails.length).toBe(1);
    expect(mails[0].to).toContain(owner.email);
    expect(mails[0].body).toContain(a.email);
    await setMembership(db, a.id, new Date(T0.getTime() + 30 * 86400_000));
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).membershipRequestedAt).toBeNull();
  });
});

describe("member discount per partner", () => {
  it("events at a partner use its discount, and changing it updates coming events", async () => {
    const { setPartnerDiscount } = await import("@/lib/services/partners");
    const { pricesFor } = await import("@/lib/pricing");
    const owner = await girl({ owner: true });
    const p = await db.partner.create({ data: { name: "Aerial", activity: "Aerial", memberDiscountPct: 30 } });
    const ev = await weekly(owner.id, { partnerId: p.id, pricingMode: "PER_PERSON", priceNonMember: 1000, totalCost: null, memberDiscountPct: undefined });
    expect(ev.memberDiscountPct).toBe(30);
    expect(pricesFor(ev, 0, 0)).toEqual({ nonMember: 1000, member: 700 });
    const other = await weekly(owner.id, { title: "No partner", memberDiscountPct: undefined });
    expect(other.memberDiscountPct).toBe(10);
    const plain = await db.partner.create({ data: { name: "Plain", activity: "Tennis" } });
    expect((await weekly(owner.id, { title: "Plain partner", partnerId: plain.id, memberDiscountPct: undefined })).memberDiscountPct).toBe(20);
    await setPartnerDiscount(db, p.id, 25, T0);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).memberDiscountPct).toBe(25);
  });
});

describe("discount when an event moves to another partner", () => {
  it("follows the new partner, and stays put on a text edit", async () => {
    const { updateEvent } = await import("@/lib/services/events");
    const owner = await girl({ owner: true });
    const p = await db.partner.create({ data: { name: "Aerial", activity: "Aerial", memberDiscountPct: 30 } });
    const ev = await weekly(owner.id, { memberDiscountPct: undefined });
    expect(ev.memberDiscountPct).toBe(10);
    const base = { kind: "WEEKLY" as const, title: ev.title, startsAt: ev.startsAt, minSpots: 10, maxSpots: 14, pricingMode: "SPLIT" as const, totalCost: 2400 };
    expect((await updateEvent(db, ev.id, { ...base, partnerId: p.id })).memberDiscountPct).toBe(30);
    expect((await updateEvent(db, ev.id, { ...base, partnerId: p.id, description: "Bring water" })).memberDiscountPct).toBe(30);
    expect((await updateEvent(db, ev.id, { ...base, partnerId: null })).memberDiscountPct).toBe(10);
  });
});

describe("partner discount can be any amount", () => {
  it("keeps a discount under 20% when the organiser sets one", async () => {
    const { setPartnerDiscount } = await import("@/lib/services/partners");
    const p = await db.partner.create({ data: { name: "Miron", activity: "Wine" } });
    await setPartnerDiscount(db, p.id, 10, T0);
    expect((await db.partner.findUniqueOrThrow({ where: { id: p.id } })).memberDiscountPct).toBe(10);
  });
});

describe("deleting upcoming events", () => {
  it("removes events that have not started, keeps past ones and ones already paid online", async () => {
    const { deleteUpcomingEvents } = await import("@/lib/services/events");
    const owner = await girl({ owner: true });
    const a = await girl();
    const past = await weekly(owner.id, { title: "Past", startsAt: new Date(T0.getTime() - 86400_000) });
    await weekly(owner.id, { title: "Coming" });
    const paid = await weekly(owner.id, { title: "Paid fusion" });
    await db.reservation.create({ data: { eventId: paid.id, userId: a.id, status: "CONFIRMED", isMember: false, paidAmount: 1500 } });
    const r = await deleteUpcomingEvents(db, T0);
    expect(r).toEqual({ deleted: 1, keptPaid: ["Paid fusion"] });
    expect((await db.event.findMany({ select: { title: true }, orderBy: { title: "asc" } })).map((e) => e.title)).toEqual(["Paid fusion", "Past"]);
    expect(past.id).toBeTruthy();
  });
});

describe("adding events afterwards", () => {
  it("a past fusion event needs no price, and choosing Fusion sets online payment by itself", async () => {
    const { createEvent } = await import("@/lib/services/events");
    const owner = await girl({ owner: true });
    const ev = await createEvent(db, owner.id, {
      kind: "FUSION", title: "Sip & Serve", startsAt: new Date(T0.getTime() - 30 * 86400_000), minSpots: 1, maxSpots: 20, pricingMode: "SPLIT",
    }, T0);
    expect(ev).toMatchObject({ kind: "FUSION", pricingMode: "ONLINE", status: "APPROVED" });
    const future = await createEvent(db, owner.id, {
      kind: "FUSION", title: "Next", startsAt: new Date(T0.getTime() + 30 * 86400_000), minSpots: 1, maxSpots: 20, pricingMode: "SPLIT", priceNonMember: 1800, priceMember: 1500,
    }, T0);
    expect(future.pricingMode).toBe("ONLINE");
  });
});

describe("deleting one event", () => {
  it("deletes a past event; refuses while someone has paid online", async () => {
    const { deleteEvent } = await import("@/lib/services/events");
    const owner = await girl({ owner: true });
    const a = await girl();
    const past = await weekly(owner.id, { startsAt: new Date(T0.getTime() - 86400_000) });
    await deleteEvent(db, past.id);
    expect(await db.event.count({ where: { id: past.id } })).toBe(0);
    const paid = await weekly(owner.id);
    await db.reservation.create({ data: { eventId: paid.id, userId: a.id, status: "CONFIRMED", isMember: false, paidAmount: 1500 } });
    expect(await code(deleteEvent(db, paid.id))).toBe("EVENT_HAS_PAYMENTS");
  });
});

describe("organiser adds girls and captains directly", () => {
  it("adds an approved member with a welcome email, and makes a girl the captain with a seat", async () => {
    const { addGirl } = await import("@/lib/services/users");
    const { assignCaptain } = await import("@/lib/services/captains");
    const { isMember } = await import("@/lib/membership");
    const owner = await girl({ owner: true });
    const ana = await addGirl(db, { name: "Ана", email: "Ana@Example.com", months: 1, welcome: true }, T0);
    expect(ana).toMatchObject({ email: "ana@example.com", status: "APPROVED" });
    expect(isMember(ana, T0)).toBe(true);
    expect(await db.emailLog.count({ where: { to: "ana@example.com" } })).toBe(1);
    const again = await addGirl(db, { name: "Ана", email: "ana@example.com", months: 1, welcome: false }, T0);
    expect(again.memberUntil!.getTime()).toBeGreaterThan(ana.memberUntil!.getTime());
    const ev = await weekly(owner.id);
    await assignCaptain(db, ev.id, ana.id, T0);
    expect((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).captainId).toBe(ana.id);
    expect((await db.reservation.findUniqueOrThrow({ where: { eventId_userId: { eventId: ev.id, userId: ana.id } } })).status).toBe("CONFIRMED");
  });
});
