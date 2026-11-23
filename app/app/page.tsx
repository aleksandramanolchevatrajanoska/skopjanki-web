import { maybeRunLifecycle } from "@/lib/services/lazy";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { loadEventCards } from "@/lib/views";
import { openDebts } from "@/lib/services/attendance";
import { EventCardView } from "@/components/EventCardView";
import { Flash } from "@/components/Flash";

export default async function AppHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  await maybeRunLifecycle();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const now = new Date();
  const tab = sp.tab === "past" ? "past" : "upcoming";
  const visible = { OR: [{ status: { in: ["APPROVED", "CANCELLED"] as ("APPROVED" | "CANCELLED")[] } }, { createdById: user.id }] };
  const cards = await loadEventCards(
    tab === "past" ? { AND: [visible, { startsAt: { lt: now } }] } : { AND: [visible, { startsAt: { gte: now } }] },
    user.id,
    tab === "past" ? "desc" : "asc",
  );
  const debts = await openDebts(prisma, user.id);
  const owed = debts.reduce((s, d) => s + d.amount, 0);
  const fusion = cards.filter((c) => c.kind === "FUSION");
  const others = cards.filter((c) => c.kind !== "FUSION");

  return (
    <>
      <div className="between">
        <div>
          <p className="label">{member ? `${t.member} ♛` : t.nonMember}</p>
          <h1>{t.events}</h1>
        </div>
        <div className="row">
          {member && <a className="btn ghost sm" href="/app/propose">{t.propose}</a>}
          {!member && <a className="btn pink sm" href="/app/membership">{t.becomeMember}</a>}
        </div>
      </div>
      <Flash sp={sp} locale={locale} />
      {owed > 0 && <div className="notice">{t.yourDebt}: <strong>{owed} MKD</strong>. {t.bringCash}.</div>}
      <nav className="row" style={{ marginTop: 12 }} aria-label="Upcoming or past">
        <a className={`btn sm ${tab === "upcoming" ? "" : "ghost"}`} href="/app">{t.upcoming}</a>
        <a className={`btn sm ${tab === "past" ? "" : "ghost"}`} href="/app?tab=past">{t.past}</a>
      </nav>
      {cards.length === 0 && <p className="meta" style={{ marginTop: 16 }}>{t.noEvents}</p>}
      {fusion.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2>{t.fusionTitle}</h2>
          <div className="grid">{fusion.map((e) => <EventCardView key={e.id} e={e} locale={locale} member={member} />)}</div>
        </section>
      )}
      {others.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>{t.monthTitle}</h2>
          <div className="grid">{others.map((e) => <EventCardView key={e.id} e={e} locale={locale} member={member} />)}</div>
        </section>
      )}
    </>
  );
}
