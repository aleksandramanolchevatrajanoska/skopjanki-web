import { maybeRunLifecycle } from "@/lib/services/lazy";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { loadEventCards } from "@/lib/views";
import { openDebts } from "@/lib/services/attendance";
import { EventCardView } from "@/components/EventCardView";
import { Flash } from "@/components/Flash";
import { eventMatches, upcomingSoon, type EventFilter } from "@/lib/services/club";
import { SPORTS } from "@/lib/i18n";
import { formatDateTime } from "@/lib/time";

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
  const levels = (user.levels ?? {}) as Record<string, string>;
  const filter: EventFilter = { q: sp.q?.trim() || undefined, sport: sp.sport || undefined, kind: sp.kind || undefined, fits: sp.fits === "1" };
  const filtering = Boolean(filter.q || filter.sport || filter.kind || filter.fits);
  const shown = cards.filter((c) => eventMatches(c, filter, levels));
  const [debts, soon] = await Promise.all([openDebts(prisma, user.id), upcomingSoon(prisma, user.id, now)]);
  const owed = debts.reduce((s, d) => s + d.amount, 0);
  const fusion = shown.filter((c) => c.kind === "FUSION");
  const others = shown.filter((c) => c.kind !== "FUSION");

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
      {soon.length > 0 && (
        <div className="notice ok" role="status">
          <strong>{t.soonTitle}:</strong>{" "}
          {soon.map((e, i) => (
            <span key={e.id}>{i > 0 && " · "}<a href={`/app/events/${e.id}`}>{e.title}</a>, {formatDateTime(e.startsAt, locale)}</span>
          ))}
        </div>
      )}
      <nav className="row" style={{ marginTop: 12 }} aria-label="Upcoming or past">
        <a className={`btn sm ${tab === "upcoming" ? "" : "ghost"}`} href="/app">{t.upcoming}</a>
        <a className={`btn sm ${tab === "past" ? "" : "ghost"}`} href="/app?tab=past">{t.past}</a>
      </nav>
      <form className="filters" role="search" aria-label={t.filter}>
        {tab === "past" && <input type="hidden" name="tab" value="past" />}
        <input name="q" defaultValue={filter.q ?? ""} placeholder={t.searchPlaceholder} aria-label={t.search} />
        <select name="sport" defaultValue={filter.sport ?? ""} aria-label={t.sport}>
          <option value="">{t.allSports}</option>
          {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="kind" defaultValue={filter.kind ?? ""} aria-label={t.filter}>
          <option value="">{t.allTypes}</option>
          {(["WEEKLY", "SPECIAL", "FUSION", "MEMBER_PLAN"] as const).map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
        </select>
        <label className="row check"><input type="checkbox" name="fits" value="1" defaultChecked={filter.fits} /> {t.fitsMyLevel}</label>
        <button className="btn sm" type="submit">{t.filter}</button>
        {filtering && <a className="btn sm ghost" href={tab === "past" ? "/app?tab=past" : "/app"}>{t.clear}</a>}
      </form>
      {filtering && shown.length === 0 && cards.length > 0 && <p className="meta" style={{ marginTop: 16 }}>{t.noMatch}</p>}
      {cards.length === 0 && (
        <p className="meta" style={{ marginTop: 16 }}>
          {t.noEvents} {user.isOwner && <a href="/admin/events">{t.noEventsOwner}</a>}
        </p>
      )}
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
