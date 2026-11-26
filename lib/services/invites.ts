import type { Db } from "./common";

export const DEFAULT_LETTER = `Скопјанки ја почнав затоа што сакав во Скопје да има место каде девојките лесно спортуваат заедно: без да бараш друштво, без да резервираш сама и без притисок дали си доволно добра.

Досега имавме Sip & Serve и Asanas & Mimosas и ги собравме најдобрите партнери во градот. Сега правам платформа за сè да оди полесно: пријава на термин со еден клик, капитенки, попусти кај партнерите и неделен newsletter.

Те канам лично, како една од првите девојки, затоа што сакам токму ти да бидеш дел од ова од самиот почеток.`;

/** The invitation letter and the list of names the organiser writes in Admin → Invites. */
export async function inviteSettings(db: Db) {
  const rows = await db.setting.findMany({ where: { key: { in: ["invite.letter", "invite.names"] } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const names = (get("invite.names") ?? "").split("\n").map((n) => cleanName(n)).filter(Boolean);
  return { letter: get("invite.letter") || DEFAULT_LETTER, names };
}

export async function saveInviteSettings(db: Db, letter: string, names: string) {
  const l = letter.trim().slice(0, 3000);
  const n = names.split("\n").map(cleanName).filter(Boolean).slice(0, 200).join("\n");
  await db.setting.upsert({ where: { key: "invite.letter" }, create: { key: "invite.letter", value: l }, update: { value: l } });
  await db.setting.upsert({ where: { key: "invite.names" }, create: { key: "invite.names", value: n }, update: { value: n } });
}

/** A first name for the card: letters, spaces and dashes only, at most 40 characters. */
export function cleanName(raw: string | null | undefined) {
  return (raw ?? "").replace(/[^\p{L}\p{M} '’.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
}
