import { isMember } from "../membership";
import { appUrl } from "../email";
import { AppError, flush, ownerEmailsFromDb, type Db } from "./common";

export const BUSINESSES_PER_MEMBER = 2;

export type BusinessInput = {
  name: string; category: string; description?: string; offer?: string; instagram?: string; website?: string; contact?: string;
};

const clean = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max) || null;

/** A paying member lists her own business; the organiser approves it before others see it. */
export async function submitBusiness(db: Db, userId: string, i: BusinessInput, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.status !== "APPROVED" || !isMember(user, now)) throw new AppError("MEMBERS_ONLY");
  if (!i.name.trim() || !i.category.trim()) throw new AppError("BAD_INPUT");
  const mine = await db.memberBusiness.count({ where: { userId, status: { in: ["PENDING", "APPROVED"] } } });
  if (mine >= BUSINESSES_PER_MEMBER) throw new AppError("BUSINESS_LIMIT");
  const b = await db.memberBusiness.create({
    data: {
      userId, name: i.name.trim().slice(0, 100), category: i.category.trim().slice(0, 60),
      description: clean(i.description, 600), offer: clean(i.offer, 200),
      instagram: clean(i.instagram, 60)?.replace(/^@/, "") ?? null, website: clean(i.website, 200), contact: clean(i.contact, 80),
    },
  });
  await flush([{
    to: await ownerEmailsFromDb(db),
    subject: `Нов бизнис од членка: ${b.name}`,
    text: `${user.name} сака да го објави својот бизнис „${b.name}“ (${b.category}).${b.offer ? `\nЗа членките: ${b.offer}` : ""}\nОдобри: ${appUrl("/admin/businesses")}`,
  }]);
  return b;
}

export async function decideBusiness(db: Db, id: string, approve: boolean) {
  return db.memberBusiness.update({ where: { id }, data: { status: approve ? "APPROVED" : "DECLINED" } });
}

/** The member who listed it, or the organiser, can remove it. */
export async function removeBusiness(db: Db, actorId: string, id: string) {
  const [actor, b] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: actorId } }), db.memberBusiness.findUnique({ where: { id } })]);
  if (!b) throw new AppError("NOT_FOUND");
  if (b.userId !== actorId && !actor.isOwner) throw new AppError("FORBIDDEN");
  await db.memberBusiness.delete({ where: { id } });
}
