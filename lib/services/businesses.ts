import { isMember } from "../membership";
import { appUrl } from "../email";
import { AppError, flush, ownerEmailsFromDb, type Db } from "./common";
import { looksLikeImage, PHOTO_TYPES, POSTER_MAX_BYTES } from "./club";

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

export const BUSINESS_MAX_PHOTOS = 5;
export const BUSINESS_MAX_PDFS = 3;
export const BUSINESS_PDF_MAX_BYTES = 4_000_000;

/** Her own business, or the organiser: who may edit it and add files. */
export async function manageableBusiness(db: Db, actorId: string, id: string) {
  const [actor, b] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: actorId } }), db.memberBusiness.findUnique({ where: { id } })]);
  if (!b) throw new AppError("NOT_FOUND");
  if (b.userId !== actorId && !actor.isOwner) throw new AppError("FORBIDDEN");
  return b;
}

/** She edits her business; it stays approved (the organiser can still hide it). Links: one per line, up to 5. */
export async function updateBusiness(db: Db, actorId: string, id: string, i: BusinessInput & { links?: string }) {
  await manageableBusiness(db, actorId, id);
  if (!i.name.trim() || !i.category.trim()) throw new AppError("BAD_INPUT");
  const links = (i.links ?? "").split(/\s*\n\s*/).map((l) => l.trim()).filter(Boolean).slice(0, 5).map((l) => l.slice(0, 200));
  return db.memberBusiness.update({
    where: { id },
    data: {
      name: i.name.trim().slice(0, 100), category: i.category.trim().slice(0, 60),
      description: clean(i.description, 1500), offer: clean(i.offer, 200),
      instagram: clean(i.instagram, 60)?.replace(/^@/, "") ?? null, website: clean(i.website, 200), contact: clean(i.contact, 80),
      links,
    },
  });
}

const looksLikePdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

/** A photo (shrunk in the browser), her logo, a poster, or a PDF for her business page. */
export async function addBusinessFile(db: Db, actorId: string, id: string, f: { name: string; mime: string; data: Buffer; slot?: string }) {
  await manageableBusiness(db, actorId, id);
  const pdf = f.mime === "application/pdf";
  if (pdf) {
    if (!looksLikePdf(f.data)) throw new AppError("PDF_TYPE");
    if (f.data.length > BUSINESS_PDF_MAX_BYTES) throw new AppError("PDF_TOO_BIG");
  } else {
    if (!PHOTO_TYPES.includes(f.mime) || !looksLikeImage(f.data, f.mime)) throw new AppError("PHOTO_TYPE");
    if (f.data.length === 0 || f.data.length > POSTER_MAX_BYTES) throw new AppError("PHOTO_TOO_BIG");
  }
  // One logo and one poster: a new one replaces the old.
  if (!pdf && (f.slot === "LOGO" || f.slot === "POSTER")) {
    await db.businessFile.deleteMany({ where: { businessId: id, kind: f.slot } });
    return db.businessFile.create({ data: { businessId: id, kind: f.slot, name: f.slot.toLowerCase(), mime: f.mime, data: new Uint8Array(f.data) } });
  }
  const kind = pdf ? "PDF" : "IMAGE";
  const count = await db.businessFile.count({ where: { businessId: id, kind } });
  if (count >= (pdf ? BUSINESS_MAX_PDFS : BUSINESS_MAX_PHOTOS)) throw new AppError("FILE_LIMIT");
  const name = f.name.replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 80) || (pdf ? "document.pdf" : "photo.jpg");
  return db.businessFile.create({ data: { businessId: id, kind, name, mime: f.mime, data: new Uint8Array(f.data) } });
}

export async function removeBusinessFile(db: Db, actorId: string, fileId: string) {
  const f = await db.businessFile.findUnique({ where: { id: fileId }, select: { businessId: true } });
  if (!f) throw new AppError("NOT_FOUND");
  await manageableBusiness(db, actorId, f.businessId);
  await db.businessFile.delete({ where: { id: fileId } });
}
