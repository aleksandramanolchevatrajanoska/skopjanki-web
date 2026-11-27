import { beforeEach, describe, expect, it } from "vitest";
import { db, girl, hours, reset, T0, weekly } from "./helpers";
import { reserve } from "@/lib/services/reservations";
import { saveAttendance } from "@/lib/services/attendance";
import {
  addPhoto, removePhoto, saveQuote, stampsThisMonth, saveAddress, addressesCsv, deleteAccount,
  eventMatches, fitsLevel, matchesCommunityFilter, monthKey, monthRange, QUOTE_MAX,
} from "@/lib/services/club";
import { icsFile, googleCalendarUrl } from "@/lib/calendar";
import { DAY } from "@/lib/time";

const code = (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code ?? String(e));
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

beforeEach(reset);

describe("moments: photos", () => {
  it("only the organiser adds photos, so the database stays small", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id); // starts T0 + 5 days
    const ana = await girl();
    await reserve(db, ana.id, e.id, T0);
    const after = new Date(e.startsAt.getTime() + 3 * 3600_000);
    await saveAttendance(db, owner.id, e.id, [ana.id], new Date(e.startsAt.getTime() + 3600_000));

    expect(await code(addPhoto(db, ana.id, e.id, "image/jpeg", JPEG, after))).toBe("PHOTO_NOT_ALLOWED"); // came, but not the organiser
    expect(await code(addPhoto(db, owner.id, e.id, "image/png", JPEG, T0))).toBe("PHOTO_BAD_TYPE");
    expect(await code(addPhoto(db, owner.id, e.id, "image/jpeg", Buffer.concat([JPEG, Buffer.alloc(1_600_000)]), T0))).toBe("PHOTO_TOO_BIG");
    const p = await addPhoto(db, owner.id, e.id, "image/jpeg", JPEG, T0);
    expect(await code(removePhoto(db, ana.id, p.id))).toBe("FORBIDDEN");
    expect(await code(removePhoto(db, owner.id, p.id))).toBe("OK");
    expect(await db.photo.count()).toBe(0);
  });
});

describe("what the girls say", () => {
  it("members only, max 140 characters, re-saving keeps a hidden quote hidden", async () => {
    const free = await girl();
    const m = await girl({ member: true });
    expect(await code(saveQuote(db, free.id, "Love it", T0))).toBe("MEMBERS_ONLY");
    expect(await code(saveQuote(db, m.id, "x".repeat(QUOTE_MAX + 1), T0))).toBe("QUOTE_TOO_LONG");
    await saveQuote(db, m.id, "  Best   Tuesdays  ", T0);
    expect((await db.quote.findUniqueOrThrow({ where: { userId: m.id } })).text).toBe("Best Tuesdays");
    await db.quote.update({ where: { userId: m.id }, data: { hidden: true } });
    await saveQuote(db, m.id, "Changed", T0);
    expect((await db.quote.findUniqueOrThrow({ where: { userId: m.id } })).hidden).toBe(true);
    await saveQuote(db, m.id, "", T0);
    expect(await db.quote.count()).toBe(0);
  });
});

describe("monthly postcard", () => {
  it("one stamp per plan joined this month that already happened", async () => {
    const owner = await girl({ owner: true });
    const ana = await girl();
    const e1 = await weekly(owner.id, { startsAt: hours(2 * 24) }); // Dec 3
    const e2 = await weekly(owner.id, { startsAt: hours(4 * 24) }); // Dec 5
    await reserve(db, ana.id, e1.id, T0);
    await reserve(db, ana.id, e2.id, T0);
    expect(await stampsThisMonth(db, ana.id, hours(3 * 24))).toBe(1);
    expect(await stampsThisMonth(db, ana.id, hours(5 * 24))).toBe(2);
    expect(monthKey(T0)).toBe("2026-12");
    const r = monthRange("2026-12");
    expect(r.from.toISOString()).toBe("2026-11-30T23:00:00.000Z"); // midnight in Skopje (UTC+1)
    expect(r.to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("address is for members, needs consent, and the CSV lists active members only and is formula-safe", async () => {
    const m = await girl({ member: true });
    const free = await girl();
    const base = { name: "=Ana", street: "Partizanska 1", zip: "1000", city: "Skopje" };
    expect(await code(saveAddress(db, free.id, { ...base, consent: true }, T0))).toBe("MEMBERS_ONLY");
    expect(await code(saveAddress(db, m.id, { ...base, consent: false }, T0))).toBe("CONSENT_REQUIRED");
    expect(await code(saveAddress(db, m.id, { ...base, street: " ", consent: true }, T0))).toBe("BAD_INPUT");
    await saveAddress(db, m.id, { ...base, consent: true }, T0);
    const csv = await addressesCsv(db, T0);
    expect(csv).toContain(`"'=Ana","Partizanska 1","1000","Skopje"`);
    expect((await addressesCsv(db, new Date(T0.getTime() + 90 * DAY))).trim().split("\r\n")).toHaveLength(1); // membership ended
  });
});

describe("filters", () => {
  const levels = { Padel: "Advanced", Tennis: "Beginner" };
  const ev = (o: Partial<{ title: string; sport: string | null; level: string | null; kind: string }>) => ({
    title: "Padel night", sport: "Padel", level: null, kind: "WEEKLY", place: null, partner: { name: "Pointer" }, ...o,
  });
  it("fits my level matches sport and level, or all-levels events", () => {
    expect(fitsLevel(ev({}), levels)).toBe(true);
    expect(fitsLevel(ev({ level: "Advanced" }), levels)).toBe(true);
    expect(fitsLevel(ev({ sport: "Tennis", level: "Advanced" }), levels)).toBe(false);
    expect(fitsLevel(ev({ sport: "Yoga" }), levels)).toBe(false);
  });
  it("search, sport and type", () => {
    expect(eventMatches(ev({}), { q: "pointer padel" }, levels)).toBe(true);
    expect(eventMatches(ev({}), { q: "yoga" }, levels)).toBe(false);
    expect(eventMatches(ev({}), { sport: "padel", kind: "WEEKLY" }, levels)).toBe(true);
    expect(eventMatches(ev({}), { kind: "FUSION" }, levels)).toBe(false);
  });
  it("community filter", () => {
    expect(matchesCommunityFilter(levels, "Padel", "Advanced")).toBe(true);
    expect(matchesCommunityFilter(levels, "Padel", "Beginner")).toBe(false);
    expect(matchesCommunityFilter(levels, undefined, "Beginner")).toBe(true);
    expect(matchesCommunityFilter(levels, "Yoga")).toBe(false);
  });
});

describe("calendar", () => {
  it("builds a valid .ics and a Google link", () => {
    const e = { id: "ev1", title: "Sip, Serve; Wine", startsAt: T0, kind: "FUSION", place: "Pointer" };
    const ics = icsFile(e, "https://x.mk/app/events/ev1", T0);
    expect(ics).toContain("DTSTART:20261201T100000Z");
    expect(ics).toContain("DTEND:20261201T130000Z");
    expect(ics).toContain("SUMMARY:Skopjanki: Sip\\, Serve\\; Wine");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(googleCalendarUrl(e, "https://x.mk")).toContain("dates=20261201T100000Z%2F20261201T130000Z");
  });
});

describe("delete my data", () => {
  it("frees her seats for the waiting list and removes her data; the organiser and paying subscribers cannot", async () => {
    const owner = await girl({ owner: true });
    const e = await weekly(owner.id, { maxSpots: 1, minSpots: 1 });
    const ana = await girl();
    const mia = await girl();
    await reserve(db, ana.id, e.id, T0);
    await reserve(db, mia.id, e.id, T0); // waiting list
    await deleteAccount(db, ana.id, T0);
    expect(await db.user.findUnique({ where: { id: ana.id } })).toBeNull();
    const miaR = await db.reservation.findUniqueOrThrow({ where: { eventId_userId: { eventId: e.id, userId: mia.id } } });
    expect(miaR.status).toBe("OFFERED");
    expect(await code(deleteAccount(db, owner.id, T0))).toBe("OWNER_CANNOT_DELETE");
    const sub = await girl({ member: true });
    await db.user.update({ where: { id: sub.id }, data: { stripeSubscriptionId: "sub_1" } });
    expect(await code(deleteAccount(db, sub.id, T0))).toBe("CANCEL_MEMBERSHIP_FIRST");
  });
});
