import { BACKGROUNDS } from "../i18n";
import { appUrl } from "../email";
import { isOwnerEmail } from "../membership";
import { normalizeEmailPlain } from "./util";
import { AppError, flush, ownerEmailsFromDb, type Db, type Outbox } from "./common";

export type JoinInput = {
  name: string;
  email: string;
  phone?: string;
  instagram?: string;
  howHeard?: string;
  topics?: string[];
  skills?: string;
  background?: string;
  businessNote?: string;
  levels: Record<string, string>;
  locale?: string;
};

/** Public "I want to join" form. The organiser approves every girl. */
export async function requestJoin(db: Db, input: JoinInput) {
  const email = normalizeEmailPlain(input.email);
  if (!input.name.trim() || !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("BAD_INPUT");
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.status === "REJECTED") throw new AppError("REQUEST_CLOSED");
    return { status: existing.status };
  }
  const owner = isOwnerEmail(email);
  const out: Outbox = [];
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      instagram: input.instagram?.trim().replace(/^@/, "") || null,
      howHeard: input.howHeard?.trim() || null,
      topics: input.topics ?? [],
      skills: input.skills?.trim().slice(0, 200) || null,
      background: input.background && BACKGROUNDS.includes(input.background) ? input.background : null,
      businessNote: input.businessNote?.trim().slice(0, 300) || null,
      levels: input.levels,
      locale: input.locale === "mk" ? "mk" : "en",
      status: owner ? "APPROVED" : "PENDING",
      isOwner: owner,
      approvedAt: owner ? new Date() : null,
    },
  });
  if (!owner) {
    out.push({
      to: await ownerEmailsFromDb(db),
      subject: `New join request: ${user.name}`,
      text: `${user.name} (${user.email}${user.instagram ? `, @${user.instagram}` : ""}) wants to join.\nHow she heard about us: ${user.howHeard ?? "-"}\nApprove: ${appUrl("/admin/girls")}`,
    });
  }
  await flush(out);
  return { status: user.status };
}

export async function decideUser(db: Db, userId: string, approve: boolean, now = new Date()) {
  const u = await db.user.update({
    where: { id: userId },
    data: approve ? { status: "APPROVED", approvedAt: now } : { status: "REJECTED" },
  });
  if (approve) {
    await flush([
      {
        to: u.email,
        subject: u.locale === "mk" ? "Добредојде во Skopjanki!" : "Welcome to Skopjanki!",
        text:
          u.locale === "mk"
            ? `Здраво ${u.name},\n\nПримена си! Најави се со твојот email тука:\n${appUrl("/login")}\n\nSkopjanki`
            : `Hi ${u.name},\n\nYou're in! Sign in with your email here:\n${appUrl("/login")}\n\nSkopjanki`,
      },
    ]);
  }
  return u;
}

/** Membership paid in cash or given by the organiser. `until` null ends it. */
export async function setMembership(db: Db, userId: string, until: Date | null) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  let memberNumber = u.memberNumber;
  if (until && memberNumber == null) memberNumber = await nextMemberNumber(db);
  return db.user.update({
    where: { id: userId },
    data: { memberUntil: until, memberNumber, ...(until ? { membershipRequestedAt: null } : {}) },
  });
}

/**
 * She asks to become a member. The organiser gets an email with her contact details and sends
 * her a payment link by hand; asking again within a day sends no second email.
 */
export async function requestMembership(db: Db, userId: string, now = new Date()) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.status !== "APPROVED") throw new AppError("NOT_APPROVED");
  if (u.isOwner || (u.memberUntil && u.memberUntil > now)) return u;
  const recent = u.membershipRequestedAt && now.getTime() - u.membershipRequestedAt.getTime() < 86_400_000;
  const updated = await db.user.update({ where: { id: userId }, data: { membershipRequestedAt: now } });
  if (!recent) {
    await flush([{
      to: await ownerEmailsFromDb(db),
      subject: `Нова членка: ${u.name} сака членство`,
      text: [
        `${u.name} сака да стане членка на Скопјанки.`,
        "",
        `Мејл: ${u.email}`,
        u.phone ? `Телефон: ${u.phone}` : "",
        u.instagram ? `Instagram: @${u.instagram}` : "",
        "",
        "Прати ѝ Stripe линк за плаќање. Кога ќе плати, означи ја како членка тука:",
        appUrl("/admin/girls?requests=1"),
      ].filter((l) => l !== "").join("\n"),
    }]);
  }
  return updated;
}

export async function nextMemberNumber(db: Db) {
  const max = await db.user.aggregate({ _max: { memberNumber: true } });
  return (max._max.memberNumber ?? 100) + 1;
}

/**
 * The organiser adds a girl herself: she is approved at once, can get months of membership,
 * and receives a welcome email with the sign-in link. An existing girl is approved and her
 * membership extended instead.
 */
export async function addGirl(
  db: Db,
  input: { name: string; email: string; phone?: string; instagram?: string; months: number; welcome: boolean },
  now = new Date(),
) {
  const email = normalizeEmailPlain(input.email);
  if (!input.name.trim() || !/^\S+@\S+\.\S+$/.test(email)) throw new AppError("BAD_INPUT");
  const existing = await db.user.findUnique({ where: { email } });
  const u = existing
    ? await db.user.update({ where: { id: existing.id }, data: { status: "APPROVED", approvedAt: existing.approvedAt ?? now } })
    : await db.user.create({
        data: {
          email, name: input.name.trim().slice(0, 80), phone: input.phone?.trim() || null,
          instagram: input.instagram?.trim().replace(/^@/, "") || null, status: "APPROVED", approvedAt: now, locale: "mk", levels: {},
        },
      });
  if (input.months > 0) {
    const base = u.memberUntil && u.memberUntil > now ? u.memberUntil : now;
    await setMembership(db, u.id, new Date(base.getTime() + input.months * 30 * 86_400_000));
  }
  if (input.welcome) {
    await flush([{
      to: u.email,
      subject: "Добредојде во Skopjanki!",
      text: `Здраво ${u.name},\n\nОрганизаторката те додаде во Скопјанки${input.months > 0 ? " како членка" : ""}. Најави се со твојот мејл тука:\n${appUrl("/login")}\n\nПрвиот мејл од нас може да заврши во Spam или Promotions; означи го како „Не е спам“.\n\nSkopjanki`,
    }]);
  }
  return db.user.findUniqueOrThrow({ where: { id: u.id } });
}
