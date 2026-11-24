import { appUrl } from "../email";
import { AppError, flush, ownerEmailsFromDb, type Db } from "./common";

export type PartnerApplicationInput = {
  business: string; kind: string; address?: string; person: string; phone: string; email: string;
  instagram?: string; website?: string; sports: string[];
  priceRegular?: number | null; priceGroup?: number | null; durationMin?: number | null; pricing?: string;
  perUnit?: number | null; units?: number | null; captainFree?: string;
  offers: string[]; discountPct?: number | null; gearPct?: number | null; otherOffer?: string;
  hostWeekly: boolean; hostFusion: boolean; capacity?: number | null; days: string[]; times?: string;
  message?: string; consent: boolean;
};

const OFFERS = ["discount_session", "discount_gear", "free_trial", "space", "gifts", "other"];

/** Public form: anyone with the link can apply, no account needed. */
export async function submitPartnerApplication(db: Db, i: PartnerApplicationInput) {
  if (!i.business.trim() || !i.kind || !i.person.trim() || !i.phone.trim() || !/^\S+@\S+\.\S+$/.test(i.email.trim())) throw new AppError("BAD_INPUT");
  if (!i.consent) throw new AppError("CONSENT_REQUIRED");
  const offers = i.offers.filter((o) => OFFERS.includes(o));
  if (offers.length === 0) throw new AppError("OFFER_REQUIRED");
  const clean = (s?: string) => (s ?? "").trim().slice(0, 500) || null;
  const app = await db.partnerApplication.create({
    data: {
      business: i.business.trim().slice(0, 120), kind: i.kind.slice(0, 60), address: clean(i.address),
      person: i.person.trim().slice(0, 120), phone: i.phone.trim().slice(0, 40), email: i.email.trim().toLowerCase().slice(0, 200),
      instagram: clean(i.instagram)?.replace(/^@/, "") ?? null, website: clean(i.website),
      sports: i.sports.slice(0, 12), priceRegular: i.priceRegular ?? null, priceGroup: i.priceGroup ?? null,
      durationMin: i.durationMin ?? null, pricing: clean(i.pricing), perUnit: i.perUnit ?? null, units: i.units ?? null,
      captainFree: clean(i.captainFree), offers,
      discountPct: offers.includes("discount_session") ? i.discountPct ?? null : null,
      gearPct: offers.includes("discount_gear") ? i.gearPct ?? null : null,
      otherOffer: offers.includes("other") ? clean(i.otherOffer) : null,
      hostWeekly: i.hostWeekly, hostFusion: i.hostFusion, capacity: i.capacity ?? null,
      days: i.days.slice(0, 7), times: clean(i.times), message: (i.message ?? "").trim().slice(0, 2000) || null,
    },
  });
  await flush([{
    to: await ownerEmailsFromDb(db),
    subject: `Нова партнерска пријава: ${app.business}`,
    text: `${app.business} (${app.kind}) сака да биде партнер.\nКонтакт: ${app.person}, ${app.phone}, ${app.email}\nПогледни: ${appUrl("/admin/partners")}`,
  }]);
  return app;
}

/** Organiser accepts: the application becomes a partner (shown on the site, gets the lists by email). */
export async function decidePartnerApplication(db: Db, id: string, accept: boolean) {
  const a = await db.partnerApplication.findUniqueOrThrow({ where: { id } });
  if (a.status !== "NEW") throw new AppError("NOT_PENDING");
  if (!accept) return db.partnerApplication.update({ where: { id }, data: { status: "DECLINED" } });
  const deal = [
    a.priceRegular != null ? `Redovno ${a.priceRegular} MKD${a.pricing ? ` ${a.pricing}` : ""}${a.durationMin ? ` / ${a.durationMin} min` : ""}` : "",
    a.priceGroup != null ? `Skopjanki ${a.priceGroup} MKD` : "",
    a.discountPct ? `${a.discountPct}% popust na termini` : "",
    a.perUnit ? `do ${a.perUnit} po teren` : "",
    a.units ? `${a.units} tereni odednash` : "",
    a.captainFree ? `kapitenka besplatno: ${a.captainFree}` : "",
  ].filter(Boolean).join(" · ");
  const partner = await db.partner.create({
    data: {
      name: a.business, activity: a.sports.join(", ") || a.kind, address: a.address, website: a.website,
      mapsUrl: a.website && /maps|goo\.gl/i.test(a.website) ? a.website : null,
      instagram: a.instagram, phone: a.phone, contact: a.phone, notes: deal || null,
    },
  });
  return db.partnerApplication.update({ where: { id }, data: { status: "ACCEPTED", partnerId: partner.id } });
}
