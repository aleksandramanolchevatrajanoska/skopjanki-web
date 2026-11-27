import type { Db } from "./common";

export const DEFAULT_LETTER = `Скопјанки го почнав со идеја да се собереме 15 девојки и повремено да играме некој спорт, затоа што сакав во Скопје да има место каде девојките аматерки во спорт лесно спортуваат заедно: без да бараат друштво, без да резервираат сами и без притисок дали се доволно добри.

После само 2 месеци увидовме дека има многу поголем интерес од кул девојки кои сакаат да се активни, но дека има простор и за повеќе од само спорт: дружба, креативни работилници, кул настани, интересни теми на разговор, networking...

Досега секоја недела имавме по една спортска активност и два fusion настани, Sip & Serve и Asanas & Mimosas.

Има интерес и од терени, клубови и искуства да нè поддржат Скопјанки и да ни даваат месечни поволности.

Сега правам платформа за сè да оди полесно: пријава на термин со еден клик, капитенки, попусти кај партнерите и неделен newsletter.

Те канам лично, како една од првите девојки, затоа што сакам токму ти да бидеш дел од ова од самиот почеток.`;

/** Who signs the invitation, under the letter. */
export const LETTER_SIGNATURE = "— Александра од Скопјанки ♛";

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
