import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { proposePlan } from "@/lib/services/events";
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
    id = (await proposePlan(prisma, user.id, rest)).id;
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
  const partners = await prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <div style={{ maxWidth: 680 }}>
      <h1>{t.planTitle}</h1>
      <p className="meta">{t.planIntro}</p>
      <Flash sp={sp} locale={locale} />
      <form action={propose} className="card" style={{ marginTop: 16 }}>
        <EventFields locale={locale} partners={partners} owner={false} />
        <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">{t.submitPlan}</button></p>
      </form>
    </div>
  );
}
