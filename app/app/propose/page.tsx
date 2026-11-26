import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { proposePlanWithPoster } from "@/lib/services/club";
import { commissionPct, proposeWorkshop } from "@/lib/services/workshops";
import { ShrinkingImageInput } from "@/components/Interactive";
import { AppError } from "@/lib/services/common";
import { EventFields, readEventForm } from "@/components/EventFields";
import { Flash } from "@/components/Flash";

async function propose(form: FormData) {
  "use server";
  const user = await requireApproved();
  const input = readEventForm(form);
  if (isNaN(input.startsAt.getTime())) redirect("/app/propose?err=BAD_INPUT");
  let id: string;
  try {
    const { kind: _k, ...rest } = input;
    const f = form.get("poster");
    const poster = f instanceof Blob && f.size > 0 ? { mime: f.type, data: Buffer.from(await f.arrayBuffer()) } : null;
    id = form.get("what") === "workshop"
      ? (await proposeWorkshop(prisma, user.id, rest, poster)).id
      : (await proposePlanWithPoster(prisma, user.id, rest, poster)).id;
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/propose?err=${e.code}`);
    throw e;
  }
  redirect(`/app/events/${id}?ok=planSent`);
}

export default async function Propose({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  if (!isMember(user)) redirect("/app/membership");
  const [partners, pct] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    commissionPct(prisma),
  ]);
  const workshop = sp.what === "workshop";
  return (
    <div style={{ maxWidth: 680 }}>
      <h1>{t.planTitle}</h1>
      <p className="meta">{t.planIntro}</p>
      <Flash sp={sp} locale={locale} />
      <form action={propose} className="card" style={{ marginTop: 16 }}>
        <fieldset className="propose-what">
          <legend>{t.proposeWhat}</legend>
          <label className="optbox">
            <input type="radio" name="what" value="plan" defaultChecked={!workshop} />
            <span><strong>{t.proposePlanOpt}</strong><span className="meta" style={{ display: "block" }}>{t.proposePlanOptHint}</span></span>
          </label>
          <label className="optbox">
            <input type="radio" name="what" value="workshop" defaultChecked={workshop} />
            <span><strong>{t.proposeWorkshopOpt}</strong><span className="meta" style={{ display: "block" }}>{t.proposeWorkshopOptHint.replace("{pct}", String(pct))}</span></span>
          </label>
        </fieldset>
        <EventFields locale={locale} partners={partners} owner={false} />
        <div style={{ marginTop: 16 }}>
          <ShrinkingImageInput name="poster" required label={t.planPhoto} hint={t.planPhotoHint} failed={t.errors.PHOTO_TYPE} />
        </div>
        <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">{t.submitPlan}</button></p>
      </form>
    </div>
  );
}
