import { randomBytes } from "crypto";
import { appUrl } from "../email";
import { isMember } from "../membership";
import { AppError, flush, type Db } from "./common";
import { nextMemberNumber } from "./users";

/** Her personal card link: a secret token, so nobody can show a made-up card at a partner. */
export async function memberCardLink(db: Db, userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  let token = u.memberCardToken;
  if (!token) {
    token = randomBytes(16).toString("base64url");
    await db.user.update({
      where: { id: userId },
      data: { memberCardToken: token, ...(u.memberNumber == null ? { memberNumber: await nextMemberNumber(db) } : {}) },
    });
  }
  return appUrl(`/karticka/${token}`);
}

/** Emails a member the link to her one-page card with how the site works. */
export async function sendMemberCard(db: Db, userId: string, now = new Date()) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.status !== "APPROVED" || !isMember(u, now)) throw new AppError("MEMBERS_ONLY");
  const link = await memberCardLink(db, userId);
  await flush([{
    to: u.email,
    subject: "Твојата членска картичка во Скопјанки ♛",
    text: [
      `Здраво ${u.name}!`,
      "",
      "Добредојде како членка на Скопјанки. Тука е твојата членска картичка и кратко упатство како да го користиш сајтот:",
      link,
      "",
      "Картичката покажи ја кај партнерите за попуст. Најави се на сајтот со овој мејл:",
      appUrl("/login"),
      "",
      "Ако мејловите од нас ти одат во Spam или Promotions, означи ги како „Не е спам“.",
      "",
      "Се гледаме на терен ♛",
      "Скопјанки",
    ].join("\n"),
  }]);
  await db.user.update({ where: { id: userId }, data: { memberCardSentAt: now } });
  return link;
}

/** Sends the card to every member who has not had one yet. */
export async function sendMissingMemberCards(db: Db, now = new Date()) {
  const girls = await db.user.findMany({ where: { status: "APPROVED", memberCardSentAt: null, isOwner: false, memberUntil: { gt: now } } });
  for (const g of girls) await sendMemberCard(db, g.id, now);
  return girls.length;
}
