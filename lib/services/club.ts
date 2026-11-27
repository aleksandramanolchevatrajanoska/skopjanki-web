import type { Prisma } from "@prisma/client";
import { isMember } from "../membership";
import { DAY, dateToSkopjeLocal, skopjeLocalToDate } from "../time";
import { AppError, type Db } from "./common";
import { cancelReservation } from "./reservations";
import { sendMail } from "../email";

/* ---------- Moments: photos ---------- */

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 1_500_000;
export const PHOTOS_PER_GIRL_PER_EVENT = 12;

/** Only girls who came to an event that already happened (or the organiser) can add photos. */
export async function canAddPhotos(db: Db, userId: string, eventId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!user || user.status !== "APPROVED" || !event || event.status === "CANCELLED") return false;
  // The organiser, the captain and the member who proposed it can add pictures any time.
  if (user.isOwner || event.captainId === userId || (event.kind === "MEMBER_PLAN" && event.createdById === userId)) return true;
  if (event.status !== "APPROVED" || event.startsAt > now) return false;
  const r = await db.reservation.findUnique({ where: { eventId_userId: { eventId, userId } } });
  return r?.status === "CONFIRMED" && r.attended !== false;
}

export async function addPhoto(db: Db, userId: string, eventId: string, mime: string, data: Buffer, now = new Date()) {
  if (!PHOTO_TYPES.includes(mime) || !looksLikeImage(data, mime)) throw new AppError("PHOTO_BAD_TYPE");
  if (data.length === 0 || data.length > PHOTO_MAX_BYTES) throw new AppError("PHOTO_TOO_BIG");
  if (!(await canAddPhotos(db, userId, eventId, now))) throw new AppError("PHOTO_NOT_ALLOWED");
  const [mine, ev, user] = await Promise.all([
    db.photo.count({ where: { eventId, userId } }),
    db.event.findUniqueOrThrow({ where: { id: eventId } }),
    db.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);
  const editor = user.isOwner || ev.captainId === userId || (ev.kind === "MEMBER_PLAN" && ev.createdById === userId);
  if (mine >= (editor ? 60 : PHOTOS_PER_GIRL_PER_EVENT)) throw new AppError("PHOTO_LIMIT");
  return db.photo.create({ data: { eventId, userId, mime, data: new Uint8Array(data) }, select: { id: true } });
}

/** Checks the file's first bytes so a renamed file cannot pass as an image. */
export function looksLikeImage(b: Buffer, mime: string) {
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

/** A girl removes only her own photos; the organiser removes any. */
export async function removePhoto(db: Db, userId: string, photoId: string) {
  const [user, photo] = await Promise.all([db.user.findUnique({ where: { id: userId } }), db.photo.findUnique({ where: { id: photoId } })]);
  if (!photo || !user) throw new AppError("NOT_FOUND");
  if (photo.userId !== userId && !user.isOwner) throw new AppError("FORBIDDEN");
  await db.photo.delete({ where: { id: photoId } });
}

/* ---------- What the girls say ---------- */

export const QUOTE_MAX = 140;

export async function saveQuote(db: Db, userId: string, raw: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isMember(user, now)) throw new AppError("MEMBERS_ONLY");
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    await db.quote.deleteMany({ where: { userId } });
    return null;
  }
  if (text.length > QUOTE_MAX) throw new AppError("QUOTE_TOO_LONG");
  // Editing keeps a hidden quote hidden: moderation cannot be skipped by re-saving.
  return db.quote.upsert({ where: { userId }, create: { userId, text }, update: { text } });
}

/* ---------- Monthly postcard ---------- */

export const STAMPS_FOR_SURPRISE = 3;

export function monthKey(d = new Date()) {
  return dateToSkopjeLocal(d).slice(0, 7);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: skopjeLocalToDate(`${month}-01T00:00`), to: skopjeLocalToDate(`${next}-01T00:00`) };
}

/** One stamp per plan she joined this month that already happened (and was not marked absent). */
export async function stampsThisMonth(db: Db, userId: string, now = new Date()) {
  const { from } = monthRange(monthKey(now));
  return db.reservation.count({
    where: {
      userId,
      status: "CONFIRMED",
      OR: [{ attended: null }, { attended: true }],
      event: { status: "APPROVED", startsAt: { gte: from, lt: now } },
    },
  });
}

export type AddressInput = { name: string; street: string; zip: string; city: string; consent: boolean };

export async function saveAddress(db: Db, userId: string, i: AddressInput, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isMember(user, now)) throw new AppError("MEMBERS_ONLY");
  if (!i.consent) throw new AppError("CONSENT_REQUIRED");
  const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  const data = { name: clean(i.name, 120), street: clean(i.street, 200), zip: clean(i.zip, 12), city: clean(i.city, 80) };
  if (!data.name || !data.street || !data.zip || !data.city) throw new AppError("BAD_INPUT");
  return db.address.upsert({ where: { userId }, create: { userId, ...data, consentAt: now }, update: { ...data, consentAt: now } });
}

/** CSV for the printer: active members who gave an address. */
export async function addressesCsv(db: Db, now = new Date()) {
  const rows = await db.address.findMany({ include: { user: true }, orderBy: { name: "asc" } });
  const q = (s: string | number | null) => {
    const v = String(s ?? "");
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // no spreadsheet formulas
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [["Name", "Street", "ZIP", "City", "Member no.", "Email"].map(q).join(",")];
  for (const a of rows) {
    if (!isMember(a.user, now)) continue;
    lines.push([a.name, a.street, a.zip, a.city, a.user.memberNumber, a.user.email].map(q).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/* ---------- Community ---------- */

export type LevelMap = Record<string, string>;

export function matchesCommunityFilter(levels: LevelMap, sport?: string, level?: string) {
  if (sport && !levels[sport]) return false;
  if (sport && level && levels[sport] !== level) return false;
  if (!sport && level && !Object.values(levels).includes(level)) return false;
  return true;
}

/* ---------- Event filters ---------- */

export type EventFilter = { q?: string; sport?: string; kind?: string; vibe?: string; fits?: boolean };

/** "Fits my level": the event's sport is one of hers, and the level is hers (or the event is for all levels). */
export function fitsLevel(e: { sport: string | null; level: string | null }, levels: LevelMap) {
  if (!e.sport) return false;
  const key = Object.keys(levels).find((s) => s.toLowerCase() === e.sport!.trim().toLowerCase());
  if (!key) return false;
  return !e.level || e.level === levels[key];
}

export function eventMatches(
  e: { title: string; sport: string | null; level: string | null; kind: string; workshop?: boolean; vibe?: string | null; place: string | null; partner: { name: string } | null },
  f: EventFilter,
  levels: LevelMap,
) {
  if (f.kind === "WORKSHOP") {
    if (!e.workshop) return false;
  } else if (f.kind && e.kind !== f.kind) return false;
  // "Active" also matches Active + Social, and so does "Social".
  if (f.vibe && !(e.vibe === f.vibe || e.vibe === "BOTH")) return false;
  if (f.sport && (e.sport ?? "").toLowerCase() !== f.sport.toLowerCase()) return false;
  if (f.fits && !fitsLevel(e, levels)) return false;
  if (f.q) {
    const hay = [e.title, e.sport, e.place, e.partner?.name].filter(Boolean).join(" ").toLowerCase();
    if (!f.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/* ---------- Reminder bar ---------- */

export async function upcomingSoon(db: Db, userId: string, now = new Date(), days = 3) {
  return db.event.findMany({
    where: {
      status: "APPROVED",
      startsAt: { gt: now, lte: new Date(now.getTime() + days * DAY) },
      reservations: { some: { userId, status: "CONFIRMED" } },
    },
    orderBy: { startsAt: "asc" },
    include: { partner: true },
  });
}

/* ---------- Delete my data ---------- */

export async function deleteAccount(db: Db, userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.isOwner) throw new AppError("OWNER_CANNOT_DELETE");
  if (user.stripeSubscriptionId && user.memberUntil && user.memberUntil > now) throw new AppError("CANCEL_MEMBERSHIP_FIRST");
  const owner = await db.user.findFirst({ where: { isOwner: true, id: { not: userId } } });
  // Free her seats in coming events first, so the waiting list gets them as usual.
  await db.event.updateMany({ where: { captainId: userId, startsAt: { gt: now } }, data: { captainId: null } });
  const coming = await db.reservation.findMany({ where: { userId, status: { not: "CANCELLED" }, event: { startsAt: { gt: now } } } });
  for (const r of coming) {
    try {
      await cancelReservation(db, userId, r.eventId, now);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Her proposed plans stay in the club's history, but no longer point at her.
    const created = await tx.event.count({ where: { createdById: userId } });
    if (created > 0) {
      if (!owner) throw new AppError("NO_OWNER");
      await tx.event.updateMany({ where: { createdById: userId }, data: { createdById: owner.id } });
    }
    await tx.event.updateMany({ where: { captainId: userId }, data: { captainId: null } });
    await tx.debt.updateMany({ where: { collectedById: userId }, data: { collectedById: null } });
    await tx.loginToken.deleteMany({ where: { email: user.email } });
    await tx.emailLog.deleteMany({ where: { to: user.email } });
    await tx.user.delete({ where: { id: userId } }); // sessions, reservations, photos, quote, address cascade
  });
}

/* ---------- Monthly email (organiser) ---------- */

/** Emails this month's postcard text to every active member who didn't opt out. Returns how many. */
export async function sendNewsletter(db: Db, month: string, appLink: (p: string) => string, now = new Date()) {
  const nl = await db.newsletter.findUnique({ where: { month } });
  if (!nl) throw new AppError("NOT_FOUND");
  const users = await db.user.findMany({ where: { status: "APPROVED", newsletterOptOut: false } });
  const to = users.filter((u) => isMember(u, now));
  const body = [
    nl.headline,
    nl.intro,
    nl.challengeTitle || nl.challengeText ? `Challenge of the month / Предизвик на месецот: ${[nl.challengeTitle, nl.challengeText].filter(Boolean).join(" – ")}` : "",
    nl.tip ? `Tip / Совет: ${nl.tip}` : "",
    `Partner codes, stamp card and your surprise / Кодови, печати и изненадување: ${appLink("/app/postcard")}`,
    `Don't want this email? / Не сакаш email? ${appLink("/app/profile")}`,
  ].filter(Boolean).join("\n\n");
  // One message per girl, so nobody sees the other addresses.
  for (const u of to) await sendMail({ to: u.email, subject: `Skopjanki · ${nl.headline}`, text: body });
  await db.newsletter.update({ where: { month }, data: { sentAt: now } });
  return to.length;
}

/* ---------- Event posters (organiser) ---------- */

export const POSTER_MAX_BYTES = 2_500_000;

export function checkPoster(mime: string, data: Buffer) {
  if (data.length === 0) throw new AppError("POSTER_REQUIRED");
  if (!PHOTO_TYPES.includes(mime) || !looksLikeImage(data, mime)) throw new AppError("PHOTO_TYPE");
  if (data.length > POSTER_MAX_BYTES) throw new AppError("PHOTO_TOO_BIG");
}

/** A member's plan always comes with a picture: checked first, saved with the plan. */
export async function proposePlanWithPoster(
  db: Db,
  userId: string,
  input: Parameters<typeof import("./events").proposePlan>[2],
  poster: { mime: string; data: Buffer } | null,
  now = new Date(),
) {
  if (!poster) throw new AppError("POSTER_REQUIRED");
  checkPoster(poster.mime, poster.data);
  const { proposePlan } = await import("./events");
  const e = await proposePlan(db, userId, input, now);
  await setPoster(db, e.id, poster.mime, poster.data);
  return e;
}

export async function setPoster(db: Db, eventId: string, mime: string, data: Buffer) {
  checkPoster(mime, data);
  const bytes = new Uint8Array(data);
  await db.eventPoster.upsert({ where: { eventId }, create: { eventId, mime, data: bytes }, update: { mime, data: bytes } });
}

export async function removePoster(db: Db, eventId: string) {
  await db.eventPoster.deleteMany({ where: { eventId } });
}

/* ---------- Club numbers for the home page ---------- */

export async function clubStats(db: Db) {
  const [girls, plans, partners] = await Promise.all([
    db.user.count({ where: { status: "APPROVED" } }),
    db.event.count({ where: { status: "APPROVED" } }),
    db.partner.count({ where: { active: true } }),
  ]);
  return { girls, plans, partners };
}

/* ---------- Site images (organiser) ---------- */

export const SITE_IMAGE_KEYS = ["team"] as const;

export async function setSiteImage(db: Db, key: string, mime: string, data: Buffer) {
  if (!(SITE_IMAGE_KEYS as readonly string[]).includes(key)) throw new AppError("BAD_INPUT");
  if (!PHOTO_TYPES.includes(mime) || !looksLikeImage(data, mime)) throw new AppError("PHOTO_TYPE");
  if (data.length === 0 || data.length > POSTER_MAX_BYTES) throw new AppError("PHOTO_TOO_BIG");
  const bytes = new Uint8Array(data);
  await db.siteImage.upsert({ where: { key }, create: { key, mime, data: bytes }, update: { mime, data: bytes } });
}

/* ---------- Partner logos (organiser) ---------- */

export async function setPartnerLogo(db: Db, partnerId: string, mime: string, data: Buffer) {
  if (!PHOTO_TYPES.includes(mime) || !looksLikeImage(data, mime)) throw new AppError("PHOTO_TYPE");
  if (data.length === 0 || data.length > POSTER_MAX_BYTES) throw new AppError("PHOTO_TOO_BIG");
  const bytes = new Uint8Array(data);
  await db.partnerLogo.upsert({ where: { partnerId }, create: { partnerId, mime, data: bytes }, update: { mime, data: bytes } });
}

/** A web link people can click: adds https:// when missing, refuses anything that is not http(s). */
export function safeUrl(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/* ---------- Search that forgives case, Cyrillic or Latin letters, and accents ---------- */

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", е: "e", ж: "zh", з: "z", ѕ: "dz", и: "i", ј: "j", к: "k", л: "l", љ: "lj",
  м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "kj", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", џ: "dz", ш: "sh",
  й: "j", я: "ja", ю: "ju", ё: "e", э: "e", ы: "i", щ: "sht", ъ: "", ь: "",
};
const LAT: Record<string, string> = { č: "ch", ć: "kj", š: "sh", ž: "zh", đ: "gj", ǵ: "gj", ḱ: "kj" };

/** Lower case, Cyrillic written in Latin letters, accents dropped: "Фотографија" and "fotografija" match. */
export function foldText(s: string) {
  return s
    .toLowerCase()
    .replace(/[а-яѓѕјљњќџйёэыщъь]/g, (c) => CYR[c] ?? c)
    .replace(/[čćšžđǵḱ]/g, (c) => LAT[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word of the query must appear somewhere in the text. */
export function matchesQuery(text: string, query: string) {
  const words = foldText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldText(text);
  return words.every((w) => hay.includes(w));
}
