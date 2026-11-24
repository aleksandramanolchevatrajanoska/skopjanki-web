import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { formatDateTime } from "@/lib/time";
import { Queens } from "@/components/Queens";
import { askEnabled } from "@/lib/ask";
import { AskBox, FlipCard, MomentCarousel, type Slide } from "@/components/Interactive";
import { clubStats } from "@/lib/services/club";
import { clubMovement } from "@/lib/services/points";
import { PartnerCard } from "@/components/PartnerCard";
import { DAY, HOUR } from "@/lib/time";

const SPORTS_TICKER = "Tennis · Padel · Aerial · Yoga · Pilates · Volleyball · Football · Running · Hiking · ";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const { t, locale } = await getT(user?.locale);
  const inside = user?.status === "APPROVED";
  const member = isMember(user);
  const now = new Date();
  const [partners, nextFusion, nextPlans, moments, quotes] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findFirst({ where: { kind: "FUSION", status: "APPROVED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, include: { partner: true } }),
    prisma.event.findMany({
      where: { kind: { not: "FUSION" }, status: "APPROVED", startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { partner: true },
    }),
    // Moments: past events with photos. Visitors see only photos the organiser made public.
    prisma.event.findMany({
      where: { status: "APPROVED", startsAt: { lt: now }, photos: { some: inside ? {} : { public: true } } },
      orderBy: { startsAt: "desc" },
      take: 6,
      include: { partner: true, photos: { where: inside ? {} : { public: true }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 20 } },
    }),
    prisma.quote.findMany({ where: { hidden: false }, include: { user: { select: { name: true, memberUntil: true, isOwner: true } } }, orderBy: { updatedAt: "desc" }, take: 12 }),
  ]);
  const [stats, move] = await Promise.all([clubStats(prisma), clubMovement(prisma)]);
  // The organiser uploads the core team photo in Admin → Home page; without it the card does not flip.
  const team = await prisma.siteImage.findUnique({ where: { key: "team" }, select: { updatedAt: true } });
  const teamPhoto = team ? `/site-images/team?v=${team.updatedAt.getTime()}` : null;
  const shownQuotes = quotes.filter((q) => isMember(q.user, now)).slice(0, 6);
  const untilFusion = nextFusion ? nextFusion.startsAt.getTime() - now.getTime() : 0;
  const firstName = (n: string) => n.split(/\s+/)[0];
  const weeks = [t.week1, t.week2, t.week3, t.week4];
  const joinHref = inside ? "/app" : "/join";
  const eventsHref = (kind: string) => (inside ? `/app?kind=${kind}` : "/join");

  return (
    <>
      {/* 01 · Hero */}
      <section className="home-hero">
        <div className="home-hero-text">
          <div className="between">
            <span className="label">01 / 06</span>
            <span className="label">{t.kicker}</span>
          </div>
          <h1 className="display">{t.heroTitle}</h1>
          <p className="tagline">{t.tagline}</p>
          {locale === "en" ? <p className="lead">{t.heroIntro}</p> : <p className="lead" lang="mk">{t.heroMk}</p>}
          <p className="row" style={{ marginTop: 18 }}>
            <a className="btn" href={joinHref}>{inside ? t.events : t.join}</a>
            {!inside && <a className="btn ghost" href="/login">{t.signIn}</a>}
            {inside && !member && <a className="btn ghost" href="/app/membership">{t.becomeMember}</a>}
          </p>
        </div>
        <FlipCard front={t.cardLine} back={t.coreTeam} team={teamPhoto} hint={t.flipHint} soon={t.coreTeamSoon} />
      </section>

      {sp.ok === "deleted" && <div className="notice ok" role="status">{t.deleted}</div>}
      {nextFusion && (
        <a className="countdown" href={inside ? `/app/events/${nextFusion.id}` : "/join"} style={{ marginTop: 20 }}>
          <span className="label">{t.countdownTo}</span>
          <strong>{nextFusion.title}</strong>
          <span>{formatDateTime(nextFusion.startsAt, locale)}</span>
          <span className="pill">{t.countdownIn} {Math.floor(untilFusion / DAY)}{t.days} {Math.floor((untilFusion % DAY) / HOUR)}{t.hoursShort}</span>
        </a>
      )}

      {/* Two big choices */}
      <section className="choices">
        <a className="choice" href={eventsHref("weekly")}>
          <span className="between"><span className="label">{t.weeklyLabel}</span><span className="label">{t.weeklyBadge}</span></span>
          <h2>{t.playTitle}</h2>
          <p>{t.playText}</p>
          <ol className="weeks-mini">
            {weeks.map((w, i) => <li key={i}><span className="label">{t.weekN} {i + 1}</span> {w}</li>)}
          </ol>
          <strong>{t.findPlan}</strong>
        </a>
        <a className="choice plum" href={eventsHref("fusion")}>
          <span className="between"><span className="label">{t.monthlyLabel}</span><span className="label">{t.monthlyBadge}</span></span>
          <h2>{t.fusionCardTitle}</h2>
          <p>{t.fusionCardText}</p>
          <strong>{t.seeFusion}</strong>
        </a>
      </section>

      <section className="mood">
        <span className="label">{t.moodKicker}</span>
        <h2 className="display-sm">{t.moodTitle}</h2>
        <p className="row" style={{ marginTop: 10 }}>
          <a className="mood-btn" href={eventsHref("weekly")}>{t.moodMove}</a>
          <a className="mood-btn" href={eventsHref("fusion")}>{t.moodMeet}</a>
        </p>
        {askEnabled() && (
          <div style={{ marginTop: 16 }}>
            <AskBox examples={t.askExamples} labels={{ askTitle: t.askOr, askPlaceholder: t.askPlaceholder, askButton: t.askButton, askThinking: t.askThinking, askError: t.askError, askNote: t.askNote }} />
          </div>
        )}
      </section>

      <div className="ticker" aria-label="Sports">
        <span>{SPORTS_TICKER.repeat(4)}</span>
      </div>

      {(stats.girls > 0 || stats.plans > 0 || stats.partners > 0) && (
        <div className="stats">
          <div><b>{stats.girls}</b><span>{t.statGirls}</span></div>
          <div><b>{stats.plans}</b><span>{t.statPlans}</span></div>
          <div><b>{stats.partners}</b><span>{t.statPartners}</span></div>
          {move.hours > 0 && <div><b>{move.hours}</b><span>{t.statHours}</span></div>}
          {move.km > 0 && <div><b>{move.km}</b><span>{t.statKm}</span></div>}
        </div>
      )}

      <section className="steps">
        {t.steps.map(([title, text], i) => (
          <div className="step" key={title}>
            <span className="label">0{i + 1} / 03</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {/* 02 · Next plans */}
      <section className="section">
        <div className="between"><span className="label">02 / 06</span><span className="label">{t.nextPlans}</span></div>
        <div className="choices" style={{ marginTop: 12 }}>
          <div className="choice static">
            <span className="between"><span className="label">{t.weeklyLabel}</span><span className="label">{t.playTitle}</span></span>
            <h2>{t.nextPlansTitle}</h2>
            {nextPlans.length === 0 ? (
              <p className="meta">{t.nextPlansEmpty}</p>
            ) : (
              <ul className="plan-list">
                {nextPlans.map((e) => (
                  <li key={e.id}>
                    <a href={inside ? `/app/events/${e.id}` : "/join"}>
                      <strong>{e.title}</strong>
                      <span className="meta">{formatDateTime(e.startsAt, locale)}{e.partner ? ` · ${e.partner.name}` : e.place ? ` · ${e.place}` : ""}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p><a className="btn sm" href={eventsHref("weekly")}>{t.allWeekly}</a></p>
          </div>
          <div className="choice plum static">
            <span className="between"><span className="label">{t.monthlyLabel}</span><span className="label">{t.fusionTitle}</span></span>
            <h2>{t.nextFusionTitle}</h2>
            {nextFusion ? (
              <a href={inside ? `/app/events/${nextFusion.id}` : "/join"} className="plan-fusion">
                <strong>{nextFusion.title}</strong>
                <span>{formatDateTime(nextFusion.startsAt, locale)}{nextFusion.partner ? ` · ${nextFusion.partner.name}` : nextFusion.place ? ` · ${nextFusion.place}` : ""}</span>
                <span>{t.member} {nextFusion.priceMember} MKD · {t.nonMember} {nextFusion.priceNonMember} MKD</span>
              </a>
            ) : (
              <p>{t.nextFusionEmpty}</p>
            )}
            <p><a className="btn sm light" href={eventsHref("fusion")}>{t.allFusion}</a></p>
          </div>
        </div>
      </section>

      {/* 03 · Moments */}
      <section className="section">
        <div className="between"><span className="label">03 / 06</span><span className="label">Moments</span></div>
        <h2 className="display-md">{t.momentsTitle}</h2>
        <p className="meta">{t.momentsText}</p>
        {moments.length > 0 ? (
          <div className="moments">
            {moments.map((e) => {
              const slides: Slide[] = [
                ...e.photos.map((ph) => ({ src: `/photos/${ph.id}`, alt: e.title })),
                // Only public fields go to the browser (never the code, email, phone or notes).
                ...(e.partner
                  ? [{ alt: e.partner.name, partner: { name: e.partner.name, activity: e.partner.activity, address: e.partner.address, mapsUrl: e.partner.mapsUrl, instagram: e.partner.instagram?.replace(/^@/, "") } }]
                  : []),
              ];
              return (
                <MomentCarousel
                  key={e.id}
                  cover={e.photos[0] ? `/photos/${e.photos[0].id}` : null}
                  title={e.title}
                  meta={formatDateTime(e.startsAt, locale)}
                  slides={slides}
                  eventHref={inside ? `/app/events/${e.id}#moments` : undefined}
                  seeEvent={t.seeEvent}
                />
              );
            })}
          </div>
        ) : (
          <div className="moments">
            {[
              { title: "Sip & Serve", when: "23 October", imgs: [["sip", "Sip & Serve poster"], ["p1", "Dinner on the court"], ["p2", "Good game"], ["p3", "Golden hour, clay court"]] },
              { title: "Asanas and Mimosas", when: "21 November", imgs: [["asanas", "Asanas and Mimosas poster"], ["story", "Asanas and Mimosas"]] },
            ].map((m) => (
              <MomentCarousel
                key={m.title}
                cover={`/img/${m.imgs[0][0]}.jpg`}
                title={m.title}
                meta={m.when}
                slides={m.imgs.map(([k, alt]) => ({ src: `/img/${k}.jpg`, alt }))}
                eventHref={eventsHref("fusion")}
                seeEvent={t.seeFusion}
              />
            ))}
          </div>
        )}
        <h3 style={{ marginTop: 28 }}>{t.quotesTitle}</h3>
        {shownQuotes.length === 0 && (
          <p className="meta">
            {t.quotesEmpty} {member ? <a href="/app/profile">{t.addQuote}</a> : <>{t.quotesMembersOnly} <a className="btn sm" href={inside ? "/app/membership" : "/join"}>{t.becomeMember}</a></>}
          </p>
        )}
        {shownQuotes.length > 0 && (
          <>
            <div className="quotes">
              {shownQuotes.map((q) => (
                <blockquote key={q.userId} className="card">
                  <p>“{q.text}”</p>
                  <footer className="meta">— {firstName(q.user.name)}</footer>
                </blockquote>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 04 · Partners */}
      <section className="section">
        <div className="between"><span className="label">04 / 06</span><span className="label">{t.partnersKicker}</span></div>
        <h2 className="display-md">{t.partnersTitle}</h2>
        <p className="meta">{t.partnersText}</p>
        {partners.length === 0 ? (
          <p className="meta" style={{ marginTop: 12 }}>{t.partnersEmpty}</p>
        ) : (
          <div className="grid">
            {partners.map((p) => <PartnerCard key={p.id} p={p} locale={locale} member={member} />)}
          </div>
        )}
        <p style={{ marginTop: 14 }}><a className="btn ghost sm" href="/partneri">{t.becomePartner}</a></p>
      </section>

      {/* 05 · Membership */}
      <section className="band court">
        <div className="band-inner">
          <div>
            <div className="between"><span className="label">05 / 06</span><span className="label">{t.membership}</span></div>
            <h2 className="display-md">{t.bandTitle}</h2>
            <p>{t.bandText}</p>
            <ul className="ticks">{t.memberPerks.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
          <div className="band-price">
            <p className="price">350 <small>MKD</small></p>
            <p className="meta">{t.perMonth}</p>
            <p className="row" style={{ marginTop: 12 }}>
              <a className="btn" href={inside ? "/app/membership" : "/join"}>{inside ? (member ? t.memberCard : t.becomeMember) : t.join}</a>
            </p>
          </div>
        </div>
      </section>

      {/* 06 · Finale */}
      <section className="band plum finale">
        <div className="band-inner center">
          <div className="between" style={{ width: "100%" }}><span className="label">06 / 06</span><span className="label">{t.finaleTitle}</span></div>
          <span className="badge big"><Queens /></span>
          <h2 className="display">{t.finaleTitle}</h2>
          <p className="tagline">{t.tagline}</p>
          <p><a className="btn pink" href={joinHref}>{inside ? t.events : t.createProfile}</a></p>
        </div>
      </section>
    </>
  );
}
