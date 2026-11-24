import type { Db } from "./common";

/** Points: 10 for every term she came to, 5 more when she was the captain. */
export const POINTS_PER_EVENT = 10;
export const POINTS_CAPTAIN_BONUS = 5;
/** A term is about an hour and a half of play. */
export const MINUTES_PER_EVENT = 90;

/** Rough distance covered per hour of play, by sport (km). Used for the "≈ km" figure only. */
const KM_PER_HOUR: [RegExp, number][] = [
  [/football|фудбал|soccer/i, 7],
  [/tennis|тенис|padel|падел/i, 3.5],
  [/volley|одбојка|basket|кошарка/i, 2],
  [/run|трча|hike|планин|walk|пешач/i, 8],
  [/yoga|јога|aerial|pilates|пилатес|stretch/i, 0.5],
];
export function kmPerHour(sport: string | null | undefined, title = "") {
  const s = `${sport ?? ""} ${title}`;
  for (const [re, km] of KM_PER_HOUR) if (re.test(s)) return km;
  return 2.5;
}

/** A term counts when she was confirmed, it already happened, and she was not marked absent. */
function cameWhere(now: Date) {
  return { status: "CONFIRMED" as const, attended: { not: false }, event: { startsAt: { lt: now }, status: { not: "CANCELLED" as const } } };
}

export async function myPoints(db: Db, userId: string, now = new Date()) {
  const rs = await db.reservation.findMany({
    where: { userId, ...cameWhere(now) },
    select: { event: { select: { captainId: true, sport: true, title: true } } },
  });
  const captained = rs.filter((r) => r.event.captainId === userId).length;
  const hours = (rs.length * MINUTES_PER_EVENT) / 60;
  const km = rs.reduce((s, r) => s + (kmPerHour(r.event.sport, r.event.title) * MINUTES_PER_EVENT) / 60, 0);
  return { events: rs.length, captained, points: rs.length * POINTS_PER_EVENT + captained * POINTS_CAPTAIN_BONUS, hours, km: Math.round(km) };
}

/** A fusion event (sport + hanging out) counts as about three hours together. */
export const MINUTES_PER_FUSION = 180;

/**
 * Club totals for sponsors: hours of play, hours of friendship (fusion events and the social part),
 * roughly how many km that is, and how many events took place.
 */
export async function clubMovement(db: Db, now = new Date()) {
  const ev = { startsAt: { lt: now }, status: "APPROVED" as const };
  const pick = { event: { select: { sport: true, title: true, kind: true } } };
  const [rs, guests, eventsHeld] = await Promise.all([
    db.reservation.findMany({ where: { status: "CONFIRMED", attended: { not: false }, event: ev }, select: pick }),
    db.eventGuest.findMany({ where: { attended: { not: false }, event: ev }, select: pick }),
    db.event.count({ where: { ...ev, example: false } }),
  ]);
  const all = [...rs, ...guests];
  const base = await statsBase(db);
  const sport = all.filter((r) => r.event.kind !== "FUSION");
  const fusion = all.filter((r) => r.event.kind === "FUSION");
  const playHours = Math.round((sport.length * MINUTES_PER_EVENT) / 60);
  const socialHours = Math.round((fusion.length * MINUTES_PER_FUSION) / 60);
  const km = Math.round(all.reduce((s, r) => s + (kmPerHour(r.event.sport, r.event.title) * MINUTES_PER_EVENT) / 60, 0));
  return {
    visits: all.length,
    hours: playHours + socialHours + base.playHours + base.socialHours,
    playHours: playHours + base.playHours,
    socialHours: socialHours + base.socialHours,
    km: km + base.km,
    eventsHeld: eventsHeld + base.eventsHeld,
  };
}

/** Numbers from before the site (e.g. events run on Instagram), added on top of what the site counts. */
export const STATS_BASE_KEYS = ["playHours", "socialHours", "km", "eventsHeld"] as const;
export type StatsBase = Record<(typeof STATS_BASE_KEYS)[number], number>;

export async function statsBase(db: Db): Promise<StatsBase> {
  const rows = await db.setting.findMany({ where: { key: { in: STATS_BASE_KEYS.map((k) => `stats.${k}`) } } });
  const out = { playHours: 0, socialHours: 0, km: 0, eventsHeld: 0 };
  for (const r of rows) {
    const k = r.key.slice(6) as keyof StatsBase;
    const v = Number(r.value);
    if (k in out && Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
  }
  return out;
}

export async function saveStatsBase(db: Db, input: Partial<Record<keyof StatsBase, number | null>>) {
  for (const k of STATS_BASE_KEYS) {
    const v = Math.max(0, Math.round(Number(input[k] ?? 0)) || 0);
    await db.setting.upsert({ where: { key: `stats.${k}` }, create: { key: `stats.${k}`, value: String(v) }, update: { value: String(v) } });
  }
}
