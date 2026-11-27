import type { Event, Partner } from "@prisma/client";
import { dicts, LEVELS, SPORTS, type Locale } from "@/lib/i18n";
import { dateToSkopjeLocal } from "@/lib/time";
import { int, str } from "@/lib/act";
import { skopjeLocalToDate } from "@/lib/time";
import { parseAgenda, type EventInput } from "@/lib/services/events";
import type { EventKind, PricingMode } from "@prisma/client";

export function EventFields({ locale, partners, e, owner }: { locale: Locale; partners: Partner[]; e?: Event; owner: boolean }) {
  const t = dicts[locale];
  return (
    <>
      {e?.kind === "MEMBER_PLAN" && <input type="hidden" name="kind" value="MEMBER_PLAN" />}
      {owner && e?.kind !== "MEMBER_PLAN" && (
        <>
          <label htmlFor="kind">Type</label>
          <select id="kind" name="kind" defaultValue={e?.kind ?? "WEEKLY"} disabled={!!e && e.kind === "FUSION"}>
            <option value="WEEKLY">{t.kinds.WEEKLY}</option>
            <option value="SPECIAL">{t.kinds.SPECIAL}</option>
            <option value="FUSION">{t.kinds.FUSION}</option>
          </select>
          {e?.kind === "FUSION" && <input type="hidden" name="kind" value="FUSION" />}
        </>
      )}
      <label htmlFor="title">{t.title}</label>
      <input id="title" name="title" required defaultValue={e?.title} />
      <label htmlFor="description">{t.description}</label>
      <textarea id="description" name="description" rows={3} defaultValue={e?.description ?? ""} />
      <div className="two">
        <div>
          <label htmlFor="partnerId">{t.partner}</label>
          <select id="partnerId" name="partnerId" defaultValue={e?.partnerId ?? ""}>
            <option value="">{t.noPartner}</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><label htmlFor="place">{t.place}</label><input id="place" name="place" defaultValue={e?.place ?? ""} /></div>
        <div>
          <label htmlFor="sport">{t.sport}</label>
          <input id="sport" name="sport" list="sports" defaultValue={e?.sport ?? ""} />
          <datalist id="sports">{SPORTS.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label htmlFor="level">{t.level}</label>
          <select id="level" name="level" defaultValue={e?.level ?? ""}>
            <option value="">{t.allLevels}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{t.levels[l]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="vibe">{t.vibeLabel}</label>
          <select id="vibe" name="vibe" defaultValue={e?.vibe ?? ""}>
            <option value="">–</option>
            <option value="ACTIVE">{t.vibes.ACTIVE}</option>
            <option value="SOCIAL">{t.vibes.SOCIAL}</option>
            <option value="BOTH">{t.vibes.BOTH}</option>
          </select>
        </div>
        <div><label htmlFor="startsAt">{t.startsAt}</label><input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={e ? dateToSkopjeLocal(e.startsAt) : ""} /></div>
        <div><label htmlFor="minSpots">{t.minSpots}</label><input id="minSpots" name="minSpots" type="number" min={1} defaultValue={e?.minSpots ?? 4} /></div>
        <div><label htmlFor="maxSpots">{t.maxSpots}</label><input id="maxSpots" name="maxSpots" type="number" min={1} defaultValue={e?.maxSpots ?? 12} /></div>
        <div><label htmlFor="durationMin">{t.durationLabel}</label><input id="durationMin" name="durationMin" type="number" min={15} step={15} defaultValue={e?.durationMin ?? ""} placeholder={e?.kind === "FUSION" ? "180" : "90"} /></div>
      </div>
      <label htmlFor="tagline">{t.taglineLabel}</label>
      <input id="tagline" name="tagline" maxLength={120} defaultValue={e?.tagline ?? ""} placeholder="Tennis & wine with Miron winery" />
      <label htmlFor="agenda">{t.agendaLabel}</label>
      <textarea id="agenda" name="agenda" rows={3} placeholder={"11:00 Yoga\n12:30 Brunch & mimosas"} defaultValue={agendaText(e?.agenda)} />
      <label htmlFor="instagramUrl">{t.instagramLink}</label>
      <input id="instagramUrl" name="instagramUrl" type="url" defaultValue={e?.instagramUrl ?? ""} placeholder="https://www.instagram.com/p/..." />
      <label htmlFor="videoUrls">{t.videoLinks}</label>
      <textarea id="videoUrls" name="videoUrls" rows={2} defaultValue={(e?.videoUrls ?? []).join("\n")} placeholder={"https://www.instagram.com/reel/...\nhttps://youtube.com/shorts/..."} />
      <label htmlFor="pricingMode">{t.pricingMode}</label>
      <select id="pricingMode" name="pricingMode" defaultValue={e?.pricingMode ?? "SPLIT"}>
        <option value="SPLIT">{t.modeSplit}</option>
        <option value="PER_PERSON">{t.modePerPerson}</option>
        {owner && <option value="ONLINE">{t.modeOnline}</option>}
      </select>
      <div className="two">
        <div><label htmlFor="totalCost">{t.totalCost}</label><input id="totalCost" name="totalCost" type="number" min={0} defaultValue={e?.totalCost ?? ""} /></div>
        <div><label htmlFor="priceNonMember">{t.priceNonMemberLabel}</label><input id="priceNonMember" name="priceNonMember" type="number" min={0} defaultValue={e?.priceNonMember ?? ""} /></div>
        {owner && <div><label htmlFor="priceMember">{t.priceMemberLabel} (fusion)</label><input id="priceMember" name="priceMember" type="number" min={0} defaultValue={e?.priceMember ?? ""} /></div>}
      </div>
    </>
  );
}

export function readEventForm(form: FormData): EventInput {
  const local = str(form.get("startsAt"));
  return {
    kind: (str(form.get("kind")) || "WEEKLY") as EventKind,
    title: str(form.get("title")),
    description: str(form.get("description")),
    sport: str(form.get("sport")),
    level: LEVELS.includes(str(form.get("level"))) ? str(form.get("level")) : null,
    vibe: str(form.get("vibe")) || null,
    tagline: str(form.get("tagline")),
    agenda: parseAgenda(str(form.get("agenda"))),
    instagramUrl: str(form.get("instagramUrl")) || null,
    videoUrls: str(form.get("videoUrls")).split(/\s+/).filter(Boolean),
    partnerId: str(form.get("partnerId")) || null,
    place: str(form.get("place")),
    startsAt: local ? skopjeLocalToDate(local) : new Date(NaN),
    minSpots: int(form.get("minSpots")) ?? 1,
    maxSpots: int(form.get("maxSpots")) ?? 20,
    durationMin: int(form.get("durationMin")),
    pricingMode: (str(form.get("pricingMode")) || "SPLIT") as PricingMode,
    totalCost: int(form.get("totalCost")),
    priceNonMember: int(form.get("priceNonMember")),
    priceMember: int(form.get("priceMember")),
  };
}

export function agendaText(a: unknown) {
  return Array.isArray(a) ? (a as [string, string][]).map(([t, l]) => (t ? `${t} ${l}` : l)).join("\n") : "";
}
