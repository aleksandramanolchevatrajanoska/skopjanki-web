export const TZ = "Europe/Skopje";

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  if (o.hour === 24) o.hour = 0;
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of Skopje local time from UTC at instant d, in ms. */
function offsetMs(d: Date) {
  const p = parts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-12-01T19:00" interpreted as Skopje local time -> UTC Date. */
export function skopjeLocalToDate(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error("Invalid date");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - offsetMs(new Date(guess));
  ts = guess - offsetMs(new Date(ts));
  return new Date(ts);
}

export function dateToSkopjeLocal(d: Date): string {
  const p = parts(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** ISO week key (Mon-Sun) of the Skopje calendar date of d, e.g. "2026-W48". */
export function weekKey(d: Date): string {
  const p = parts(d);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export function formatDateTime(d: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "mk" ? "mk-MK" : "en-GB", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
