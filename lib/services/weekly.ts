import { appUrl, sendMail } from "../email";
import { dicts, type Locale } from "../i18n";
import { DAY, dateToSkopjeLocal, formatDateTime, weekKey } from "../time";
import { fmtRange, loadEventCards } from "../views";
import type { Db } from "./common";
import { isMember } from "../membership";

/** Events in the next 7 days, as the letter lists them. */
export async function weekEvents(now: Date) {
  return loadEventCards({ status: "APPROVED", startsAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } }, null);
}

const C = { bg: "#FFF9ED", card: "#FFFDF6", plum: "#432344", muted: "#7B627C", line: "#EBDDD0", pink: "#F49BBC", soft: "#F2D3E2", court: "#DCE5B3" };
const SERIF = "Newsreader,Georgia,'Times New Roman',serif";
const SANS = "'Hanken Grotesk',Helvetica,Arial,sans-serif";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function paras(s: string) {
  return s.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/**
 * The weekly letter. Members get the week's plans, the tips and the thought of the week;
 * everyone else gets the plans and a line about what members get.
 */
export async function composeWeekly(db: Db, locale: Locale, now = new Date(), member = true) {
  const t = dicts[locale];
  const wk = weekKey(now);
  const [letter, events] = await Promise.all([db.weeklyLetter.findUnique({ where: { weekKey: wk } }), weekEvents(now)]);
  const tips = (letter?.tips ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const showThought = member && Boolean(letter?.body);
  const showTips = member && tips.length > 0;
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
    ...(showTips ? ["", `— ${t.weeklyTips} —`, ...tips.map((x) => `• ${x}`)] : []),
    ...(showThought ? ["", `— ${t.weeklyThought}: ${letter!.title} —`, letter!.body] : []),
    ...(!member && (letter?.body || tips.length) ? ["", `${t.weeklyMembersOnly} ${t.weeklyBecomeMember}: ${appUrl("/app/membership")}`] : []),
    "",
    `${t.weeklyAll}: ${appUrl("/app")}`,
    "",
    t.weeklyOptOut + " " + appUrl("/app/profile"),
  ].join("\n");

  const btn = (href: string, label: string, bg = C.pink) =>
    `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${C.plum};text-decoration:none;font:600 14px/1 ${SANS};padding:12px 18px;border-radius:999px">${esc(label)}</a>`;
  const label = (s: string) => `<p style="margin:0 0 14px;font:600 11px/1.2 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.muted}">${esc(s)}</p>`;
  const eventCards = events.length
    ? events
        .map((e) => {
          const where = e.partner?.name ?? e.place ?? "";
          const tag = e.kind === "FUSION" ? C.soft : C.court;
          const price = e.range ? `${t.member} ${fmtRange(e.range.member)} · ${t.nonMember} ${fmtRange(e.range.nonMember)} MKD` : "";
          return `<tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:16px"><tr><td style="padding:18px 20px">
<span style="display:inline-block;background:${tag};color:${C.plum};font:600 11px/1 ${SANS};padding:6px 10px;border-radius:999px;letter-spacing:.04em">${esc(t.kinds[e.kind])}${e.example ? ` · ${esc(t.exampleTag)}` : ""}</span>
<p style="margin:12px 0 6px;font:400 24px/1.15 ${SERIF};color:${C.plum}">${esc(e.title)}</p>
<p style="margin:0 0 4px;font:400 14px/1.5 ${SANS};color:${C.plum}">${esc(formatDateTime(e.startsAt, locale))}${where ? ` · ${esc(where)}` : ""}</p>
${price ? `<p style="margin:0 0 14px;font:400 13px/1.5 ${SANS};color:${C.muted}">${esc(price)}</p>` : `<p style="margin:0 0 14px"></p>`}
${btn(appUrl(`/app/events/${e.id}`), t.weeklySeePlan)}
</td></tr></table></td></tr>`;
        })
        .join("")
    : `<tr><td style="padding:0 0 14px;font:400 15px/1.6 ${SANS};color:${C.muted}">${esc(t.weeklyNoEvents)}</td></tr>`;
  const tipsHtml = showTips
    ? `<tr><td style="padding:22px 0 0">${label(t.weeklyTips)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.court};border-radius:16px"><tr><td style="padding:18px 22px;font:400 15px/1.6 ${SANS};color:${C.plum}">
${tips.map((x) => `<p style="margin:0 0 8px">✦ ${esc(x)}</p>`).join("")}
</td></tr></table></td></tr>`
    : "";
  const thoughtHtml = showThought
    ? `<tr><td style="padding:22px 0 0">${label(t.weeklyThought)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:16px"><tr><td style="padding:22px 24px;color:${C.plum}">
<p style="margin:0 0 12px;font:italic 400 26px/1.2 ${SERIF}">${esc(letter!.title)}</p>
<div style="font:400 15px/1.65 ${SANS}">${paras(letter!.body)}</div>
</td></tr></table></td></tr>`
    : "";
  const upsell =
    !member && (letter?.body || tips.length)
      ? `<tr><td style="padding:22px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${C.pink};border-radius:16px"><tr><td style="padding:18px 22px;font:400 15px/1.6 ${SANS};color:${C.plum}">
<p style="margin:0 0 12px">${esc(t.weeklyMembersOnly)}</p>${btn(appUrl("/app/membership"), t.weeklyBecomeMember)}</td></tr></table></td></tr>`
      : "";
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&family=Newsreader:ital,wght@0,400;1,400&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 0 22px;border-bottom:1px solid ${C.line}">
<a href="${esc(appUrl("/"))}"><img src="${esc(appUrl("/logo.png"))}" alt="Skopjanki – Active Girls Club" width="170" style="display:block;width:170px;height:auto;border:0"></a>
<p style="margin:8px 0 0;font:600 11px/1.2 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.muted}">${esc(t.weeklyThisWeek)} · ${esc(wk)}</p>
</td></tr>
<tr><td style="padding:24px 0 18px;font:400 17px/1.55 ${SANS};color:${C.plum}">${esc(t.weeklyHello)}</td></tr>
<tr><td>${label(t.weeklyThisWeek)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventCards}</table></td></tr>
${tipsHtml}${thoughtHtml}${upsell}
<tr><td align="center" style="padding:30px 0 10px">${btn(appUrl("/app"), t.weeklyAll, C.plum).replace(`color:${C.plum};text-decoration`, `color:${C.bg};text-decoration`)}</td></tr>
<tr><td style="padding:22px 0 0;border-top:1px solid ${C.line};font:400 12px/1.6 ${SANS};color:${C.muted};text-align:center">
${esc(t.weeklyOptOut)} <a href="${esc(appUrl("/app/profile"))}" style="color:${C.muted}">${esc(appUrl("/app/profile").replace(/^https?:\/\//, ""))}</a><br>Skopjanki · Skopje
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, events: events.length, hasThought: Boolean(letter?.body) };
}

/** Sends this week's letter once (or again with force) to every approved girl who did not opt out. */
export async function sendWeekly(db: Db, now = new Date(), force = false) {
  const wk = weekKey(now);
  const existing = await db.weeklyLetter.findUnique({ where: { weekKey: wk } });
  if (existing?.sentAt && !force) return { sent: 0, skipped: true };
  const girls = await db.user.findMany({
    where: { status: "APPROVED", newsletterOptOut: false },
    select: { email: true, locale: true, isOwner: true, memberUntil: true },
  });
  const letters = new Map<string, Awaited<ReturnType<typeof composeWeekly>>>();
  for (const g of girls) {
    const loc: Locale = g.locale === "mk" ? "mk" : "en";
    const member = isMember(g, now);
    const key = `${loc}:${member}`;
    if (!letters.has(key)) letters.set(key, await composeWeekly(db, loc, now, member));
    const { subject, text, html } = letters.get(key)!;
    // One message per girl, so nobody sees the other addresses.
    await sendMail({ to: g.email, subject, text, html });
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
