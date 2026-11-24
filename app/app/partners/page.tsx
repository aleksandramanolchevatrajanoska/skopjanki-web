import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { PartnerCard } from "@/components/PartnerCard";

export default async function Partners() {
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const partners = await prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { logo: { select: { updatedAt: true } } } });
  return (
    <>
      <div className="between">
        <div><h1>{t.partners}</h1><p className="meta">{t.partnersIntro}</p></div>
        {!member && <a className="btn pink sm" href="/app/membership">{t.becomeMember}</a>}
      </div>
      <div className="grid">{partners.map((p) => <PartnerCard key={p.id} p={p} locale={locale} member={member} />)}</div>
      {partners.length === 0 && <p className="meta">–</p>}
    </>
  );
}
