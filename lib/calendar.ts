import { HOUR } from "./time";

export type CalEvent = { id: string; title: string; startsAt: Date; kind: string; place?: string | null; description?: string | null };

/** Weekly terms last about 1.5 hours; fusion events about 3. */
export function endOf(e: CalEvent) {
  return new Date(e.startsAt.getTime() + (e.kind === "FUSION" ? 3 : 1.5) * HOUR);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: CalEvent, link: string) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `Skopjanki: ${e.title}`,
    dates: `${stamp(e.startsAt)}/${stamp(endOf(e))}`,
    details: [e.description, link].filter(Boolean).join("\n\n"),
    location: e.place ?? "",
    ctz: "Europe/Skopje",
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** RFC 5545 text escaping and 75-octet line folding. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A one-event .ics file (Apple Calendar, Outlook), with a reminder 3 hours before. */
export function icsFile(e: CalEvent, link: string, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Skopjanki//Active Girls Club//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@skopjanki`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(endOf(e))}`,
    `SUMMARY:${esc(`Skopjanki: ${e.title}`)}`,
    e.place ? `LOCATION:${esc(e.place)}` : "",
    `DESCRIPTION:${esc([e.description, link].filter(Boolean).join("\n\n"))}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT3H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}
