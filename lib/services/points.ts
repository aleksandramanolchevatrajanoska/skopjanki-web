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

/** Club totals for sponsors: hours of play together and roughly how many km that is. */
export async function clubMovement(db: Db, now = new Date()) {
  const [rs, guests] = await Promise.all([
    db.reservation.findMany({ where: cameWhere(now), select: { event: { select: { sport: true, title: true } } } }),
    db.eventGuest.findMany({
      where: { attended: { not: false }, event: { startsAt: { lt: now }, status: { not: "CANCELLED" } } },
      select: { event: { select: { sport: true, title: true } } },
    }),
  ]);
  const all = [...rs, ...guests];
  const hours = Math.round((all.length * MINUTES_PER_EVENT) / 60);
  const km = Math.round(all.reduce((s, r) => s + (kmPerHour(r.event.sport, r.event.title) * MINUTES_PER_EVENT) / 60, 0));
  return { visits: all.length, hours, km };
}
