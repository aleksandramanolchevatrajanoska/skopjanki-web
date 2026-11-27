import type { Db } from "./common";

/** Points: 10 for every term she came to, 5 more when she was the captain. */
export const POINTS_PER_EVENT = 10;
export const POINTS_CAPTAIN_BONUS = 5;
/** A term is about an hour and a half of play. */
export const MINUTES_PER_EVENT = 90;

/** One average for every sport: about 3 km covered per hour of play. Used for the "≈ km" figure only. */
export const KM_PER_HOUR = 3;

/** A term counts when she was confirmed, it already happened, and she was not marked absent. */
function cameWhere(now: Date) {
  return { status: "CONFIRMED" as const, attended: { not: false }, event: { startsAt: { lt: now }, status: { not: "CANCELLED" as const } } };
}

export async function myPoints(db: Db, userId: string, now = new Date()) {
  const rs = await db.reservation.findMany({
    where: { userId, ...cameWhere(now) },
    select: { event: { select: { captainId: true, kind: true, durationMin: true } } },
  });
  const captained = rs.filter((r) => r.event.captainId === userId).length;
  const hours = round1(rs.reduce((s, r) => s + eventMinutes(r.event) / 60, 0));
  const km = rs.reduce((s, r) => s + (playMinutes(r.event) / 60) * KM_PER_HOUR, 0);
  return { events: rs.length, captained, points: rs.length * POINTS_PER_EVENT + captained * POINTS_CAPTAIN_BONUS, hours, km: Math.round(km) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** How long an event lasts: what the organiser entered, else 90 minutes (a fusion event 180). */
export function eventMinutes(e: { kind: string; durationMin?: number | null }) {
  return e.durationMin && e.durationMin > 0 ? e.durationMin : e.kind === "FUSION" ? MINUTES_PER_FUSION : MINUTES_PER_EVENT;
}

/** The part spent playing: all of a sport event; the sport part of a fusion event (up to 90 minutes). */
export function playMinutes(e: { kind: string; durationMin?: number | null }) {
  return e.kind === "FUSION" ? Math.min(MINUTES_PER_EVENT, eventMinutes(e)) : eventMinutes(e);
}

/** A fusion event (sport + hanging out) lasts three hours unless the organiser enters another length. */
export const MINUTES_PER_FUSION = 180;

/**
 * The events the club ran before the site existed (Sip & Serve with about 10 girls on tennis,
 * Asanas & Mimosas with about 16 on yoga). Used only while the site has no past events of its own,
 * so the home page never shows zeros.
 */
const BEFORE_THE_SITE = [
  { kind: "FUSION", sport: "Tennis", title: "Sip & Serve", girls: 10, durationMin: 180 },
  { kind: "FUSION", sport: "Yoga", title: "Asanas & Mimosas", girls: 16, durationMin: 180 },
] as const;

/**
 * Club totals for sponsors: hours of play, hours of friendship (fusion events), roughly how many km
 * that is, and how many events took place. Where the site knows who came, it counts them; for a past
 * event nobody signed up to on the site (run over Instagram), it estimates from the event's size.
 */
/**
 * Girls at a past event nobody signed up to on the site: about three quarters of its places,
 * at least its minimum, and at least 8 (10 for a fusion event) when its size was never filled in.
 */
export function estimateGirls(e: { kind: string; minSpots: number; maxSpots: number }) {
  const floor = e.kind === "FUSION" ? 10 : 8;
  if (e.maxSpots <= 1) return Math.max(e.minSpots, floor);
  return Math.max(e.minSpots, Math.round(e.maxSpots * 0.75));
}

export async function clubMovement(db: Db, now = new Date()) {
  const [events, base] = await Promise.all([
    db.event.findMany({
      where: { startsAt: { lt: now }, status: "APPROVED", example: false },
      select: {
        kind: true, sport: true, title: true, minSpots: true, maxSpots: true, durationMin: true,
        _count: {
          select: {
            reservations: { where: { status: "CONFIRMED", attended: { not: false } } },
            guests: { where: { attended: { not: false } } },
          },
        },
      },
    }),
    statsBase(db),
  ]);
  const list = events.length
    ? events.map((e) => ({ ...e, girls: e._count.reservations + e._count.guests || estimateGirls(e) }))
    : BEFORE_THE_SITE.map((e) => ({ ...e }));
  // Hours are the events' own length, not multiplied by the girls; km are per girl.
  let play = 0;
  let social = 0;
  let km = 0;
  for (const e of list) {
    const p = playMinutes(e) / 60;
    play += p;
    if (e.kind === "FUSION") social += eventMinutes(e) / 60;
    km += e.girls * p * KM_PER_HOUR;
  }
  const playHours = round1(play) + base.playHours;
  const socialHours = round1(social) + base.socialHours;
  return {
    visits: list.reduce((s, e) => s + e.girls, 0),
    hours: playHours + socialHours,
    playHours,
    socialHours,
    km: Math.round(km) + base.km,
    eventsHeld: list.length + base.eventsHeld,
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
