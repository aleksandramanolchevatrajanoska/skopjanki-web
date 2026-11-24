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
  sportRows?: string; slots?: string;
};

const n = (v: unknown, max = 1_000_000) => {
  const x = Number(String(v ?? "").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(x) && x >= 0 ? Math.min(Math.round(x), max) : null;
};
const txt = (v: unknown, max = 60) => String(v ?? "").trim().slice(0, max);

/** Per-sport prices and group sizes from the form (JSON); anything odd is dropped. */
export function parseSportRows(raw?: string) {
  let a: unknown;
  try { a = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(a)) return [];
  return a.slice(0, 12).flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const sport = txt(o.sport);
    if (!sport) return [];
    return [{
      sport, priceRegular: n(o.priceRegular), priceGroup: n(o.priceGroup), durationMin: n(o.durationMin, 1440),
      pricing: txt(o.pricing, 30) || null, minGirls: n(o.minGirls, 500), maxGirls: n(o.maxGirls, 500), units: n(o.units, 100),
    }];
  });
}

const DAY_NAMES = ["Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота", "Недела"];
/** Days and hours offered to Skopjanki (JSON); keeps only known days and HH:MM times. */
export function parseSlots(raw?: string) {
  let a: unknown;
  try { a = JSON.parse(raw || "[]"); } catch { return []; }
  if (!Array.isArray(a)) return [];
  const hm = (v: unknown) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : null);
  return a.slice(0, 30).flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const day = String(o.day ?? "");
    return DAY_NAMES.includes(day) ? [{ day, from: hm(o.from), to: hm(o.to) }] : [];
  });
}

const OFFERS = ["discount_session", "discount_gear", "free_trial", "space", "gifts", "other"];

/** Public form: anyone with the link can apply, no account needed. */
export async function submitPartnerApplication(db: Db, i: PartnerApplicationInput) {
  if (!i.business.trim() || !i.kind || !i.person.trim() || !i.phone.trim() || !/^\S+@\S+\.\S+$/.test(i.email.trim())) throw new AppError("BAD_INPUT");
  if (!i.consent) throw new AppError("CONSENT_REQUIRED");
  const offers = i.offers.filter((o) => OFFERS.includes(o));
  if (offers.length === 0) throw new AppError("OFFER_REQUIRED");
  const clean = (s?: string) => (s ?? "").trim().slice(0, 500) || null;
  const rows = parseSportRows(i.sportRows);
  const slots = parseSlots(i.slots);
  const first = rows[0];
  const app = await db.partnerApplication.create({
    data: {
      business: i.business.trim().slice(0, 120), kind: i.kind.slice(0, 60), address: clean(i.address),
      person: i.person.trim().slice(0, 120), phone: i.phone.trim().slice(0, 40), email: i.email.trim().toLowerCase().slice(0, 200),
      instagram: clean(i.instagram)?.replace(/^@/, "") ?? null, website: clean(i.website),
      sports: rows.length ? rows.map((r) => r.sport) : i.sports.slice(0, 12),
      priceRegular: first?.priceRegular ?? i.priceRegular ?? null, priceGroup: first?.priceGroup ?? i.priceGroup ?? null,
      durationMin: first?.durationMin ?? i.durationMin ?? null, pricing: first?.pricing ?? clean(i.pricing),
      perUnit: first?.maxGirls ?? i.perUnit ?? null, units: first?.units ?? i.units ?? null,
      sportDetails: rows.length ? rows : undefined, slots: slots.length ? slots : undefined,
      captainFree: clean(i.captainFree), offers,
      discountPct: offers.includes("discount_session") ? i.discountPct ?? null : null,
      gearPct: offers.includes("discount_gear") ? i.gearPct ?? null : null,
      otherOffer: offers.includes("other") ? clean(i.otherOffer) : null,
      hostWeekly: i.hostWeekly, hostFusion: i.hostFusion, capacity: i.capacity ?? null,
      days: slots.length ? [...new Set(slots.map((x) => x.day))] : i.days.slice(0, 7), times: clean(i.times), message: (i.message ?? "").trim().slice(0, 2000) || null,
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
  const deal = [...partnerDealLines(a), a.captainFree ? `Kapitenka besplatno: ${a.captainFree}` : ""].filter(Boolean).join("\n");
  const partner = await db.partner.create({
    data: {
      name: a.business, activity: a.sports.join(", ") || a.kind, address: a.address, website: a.website,
      mapsUrl: a.website && /maps|goo\.gl/i.test(a.website) ? a.website : null,
      instagram: a.instagram, phone: a.phone, contact: a.phone, notes: deal || null,
    },
  });
  return db.partnerApplication.update({ where: { id }, data: { status: "ACCEPTED", partnerId: partner.id } });
}

type AppLike = {
  sportDetails: unknown; slots: unknown; priceRegular: number | null; priceGroup: number | null; pricing: string | null;
  durationMin: number | null; perUnit: number | null; units: number | null; discountPct: number | null; days: string[]; times: string | null;
};

/** Readable lines for the organiser: one per sport, then the days and hours offered. */
export function partnerDealLines(a: AppLike) {
  const rows = parseSportRows(JSON.stringify(a.sportDetails ?? []));
  const slots = parseSlots(JSON.stringify(a.slots ?? []));
  const lines = rows.length
    ? rows.map((r) => [
        `${r.sport}:`,
        r.priceRegular != null ? `redovno ${r.priceRegular} MKD` : "",
        r.priceGroup != null ? `za Skopjanki ${r.priceGroup} MKD` : "",
        r.pricing ?? "",
        r.durationMin ? `${r.durationMin} min` : "",
        r.minGirls != null || r.maxGirls != null ? `${r.minGirls ?? "?"}–${r.maxGirls ?? "?"} devojki` : "",
        r.units ? `${r.units} tereni odednash` : "",
      ].filter(Boolean).join(" "))
    : [[
        a.priceRegular != null ? `Redovno ${a.priceRegular} MKD${a.pricing ? ` ${a.pricing}` : ""}${a.durationMin ? ` / ${a.durationMin} min` : ""}` : "",
        a.priceGroup != null ? `Skopjanki ${a.priceGroup} MKD` : "",
        a.perUnit ? `do ${a.perUnit} po teren` : "",
        a.units ? `${a.units} tereni odednash` : "",
      ].filter(Boolean).join(" · ")].filter(Boolean);
  if (a.discountPct) lines.push(`${a.discountPct}% popust na termini`);
  if (slots.length) lines.push(`Termini za Skopjanki: ${slots.map((x) => `${x.day}${x.from ? ` ${x.from}` : ""}${x.to ? `–${x.to}` : ""}`).join(", ")}`);
  else if (a.days.length || a.times) lines.push(`Denovi: ${[a.days.join(", "), a.times].filter(Boolean).join(" · ")}`);
  return lines;
}
