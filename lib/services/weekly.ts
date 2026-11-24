import { appUrl, sendMail } from "../email";
import { dicts, type Locale } from "../i18n";
import { DAY, dateToSkopjeLocal, formatDateTime, weekKey } from "../time";
import { fmtRange, loadEventCards } from "../views";
import type { Db } from "./common";

/** Events in the next 7 days, as the letter lists them. */
export async function weekEvents(now: Date) {
  return loadEventCards({ status: "APPROVED", startsAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } }, null);
}

export async function composeWeekly(db: Db, locale: Locale, now = new Date()) {
  const t = dicts[locale];
  const wk = weekKey(now);
  const [letter, events] = await Promise.all([db.weeklyLetter.findUnique({ where: { weekKey: wk } }), weekEvents(now)]);
  const lines = events.map((e) => {
    const where = e.partner?.name ?? e.place ?? "";
    const price = e.range ? ` · ${t.member} ${fmtRange(e.range.member)} / ${t.nonMember} ${fmtRange(e.range.nonMember)} MKD` : "";
    return `• ${e.title}${e.example ? ` (${t.exampleTag})` : ""}\n  ${formatDateTime(e.startsAt, locale)}${where ? ` · ${where}` : ""}${price}\n  ${appUrl(`/app/events/${e.id}`)}`;
  });
  const subject = letter?.title ? `Skopjanki · ${letter.title}` : t.weeklySubject;
  const text = [
    t.weeklyHello,
    "",
    t.weeklyThisWeek,
    lines.length ? lines.join("\n\n") : t.weeklyNoEvents,
    ...(letter?.body ? ["", `— ${t.weeklyThought}: ${letter.title} —`, letter.body] : []),
    "",
    `${t.weeklyAll}: ${appUrl("/app")}`,
    "",
    t.weeklyOptOut + " " + appUrl("/app/profile"),
  ].join("\n");
  return { subject, text, events: events.length, hasThought: Boolean(letter?.body) };
}

/** Sends this week's letter once (or again with force) to every approved girl who did not opt out. */
export async function sendWeekly(db: Db, now = new Date(), force = false) {
  const wk = weekKey(now);
  const existing = await db.weeklyLetter.findUnique({ where: { weekKey: wk } });
  if (existing?.sentAt && !force) return { sent: 0, skipped: true };
  const girls = await db.user.findMany({ where: { status: "APPROVED", newsletterOptOut: false }, select: { email: true, locale: true } });
  const byLocale: Record<string, string[]> = {};
  for (const g of girls) (byLocale[g.locale === "mk" ? "mk" : "en"] ??= []).push(g.email);
  for (const [loc, emails] of Object.entries(byLocale)) {
    const { subject, text } = await composeWeekly(db, loc as Locale, now);
    // One message per girl, so nobody sees the other addresses.
    for (const to of emails) await sendMail({ to, subject, text });
  }
  await db.weeklyLetter.upsert({
    where: { weekKey: wk },
    create: { weekKey: wk, title: "", body: "", sentAt: now, sentCount: girls.length },
    update: { sentAt: now, sentCount: girls.length },
  });
  return { sent: girls.length, skipped: false };
}

/** Monday from 8:00 Skopje time, once a week. */
export function isWeeklySendTime(now: Date) {
  const local = dateToSkopjeLocal(now);
  const day = new Date(`${local.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return day === 1 && Number(local.slice(11, 13)) >= 8;
}
