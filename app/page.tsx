import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember, MEMBERSHIP_MKD } from "@/lib/membership";
import { formatDateTime } from "@/lib/time";
import { Queens } from "@/components/Queens";
import { askEnabled } from "@/lib/ask";
import { AskBox, FlipCard, MomentCarousel, type Slide } from "@/components/Interactive";
import { clubStats } from "@/lib/services/club";
import { clubMovement } from "@/lib/services/points";
import { coverOf } from "@/lib/views";
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
  const [partners, nextFusion, nextPlans, moments, quotes, stats, move, team] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { logo: { select: { updatedAt: true } } } }),
    prisma.event.findFirst({ where: { kind: "FUSION", status: "APPROVED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, include: { partner: true, poster: { select: { eventId: true, updatedAt: true } }, photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 } } }),
    prisma.event.findMany({
      where: { kind: { not: "FUSION" }, status: "APPROVED", startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { partner: true, poster: { select: { eventId: true, updatedAt: true } }, photos: { select: { id: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    }),
    // Moments: past events with photos. Visitors see only photos the organiser made public.
    prisma.event.findMany({
      where: { status: "APPROVED", startsAt: { lt: now }, photos: { some: inside ? {} : { public: true } } },
      orderBy: { startsAt: "desc" },
      take: 6,
      include: { partner: true, photos: { where: inside ? {} : { public: true }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 20 } },
    }),
    prisma.quote.findMany({ where: { hidden: false }, include: { user: { select: { name: true, memberUntil: true, isOwner: true } } }, orderBy: { updatedAt: "desc" }, take: 12 }),
    clubStats(prisma),
    clubMovement(prisma),
    prisma.siteImage.findUnique({ where: { key: "team" }, select: { updatedAt: true } }),
  ]);
  // The organiser uploads the core team photo in Admin → Home page; without it the card does not flip.
  const teamPhoto = team ? `/site-images/team?v=${team.updatedAt.getTime()}` : null;
  const shownQuotes = quotes.filter((q) => isMember(q.user, now)).slice(0, 6);
  const untilFusion = nextFusion ? nextFusion.startsAt.getTime() - now.getTime() : 0;
  const firstName = (n: string) => n.split(/\s+/)[0];
  const cover = (e: { id: string; imageUrl: string | null; poster: { eventId: string; updatedAt: Date } | null; photos: { id: string }[] }) =>
    coverOf({ id: e.id, imageUrl: e.imageUrl, hasPoster: e.poster != null, posterVersion: e.poster?.updatedAt.getTime(), firstPhotoId: e.photos[0]?.id });
  const fusionCover = nextFusion ? cover(nextFusion) : null;
  const joinHref = inside ? "/app" : "/join";
  const eventsHref = (kind: string) => (inside ? `/app?kind=${kind}` : "/join");

  return (
    <>
      {/* 01 · Hero */}
      <section className="home-hero">
        <div className="home-hero-text">
          <div className="between">
            <span className="label">01 / 09</span>
            <span className="label">{t.kicker}</span>
          </div>
          <h1 className="display">{t.heroTitle}</h1>
          <p className="tagline">{t.tagline}</p>
          {locale === "en" ? <p className="lead">{t.heroIntro}</p> : <p className="lead" lang="mk">{t.heroMk}</p>}
          <div className="pillars">
            <p className="label">{t.pillarsTitle}</p>
            <ol>
              {t.pillars.map(([title, text], i) => {
                const href = i === 0 ? eventsHref("weekly") : !inside ? "/join" : i === 1 ? "/app/biznisi" : "/app?kind=weekly&type=WORKSHOP";
                return <li key={title}><a href={href}><strong>{title}</strong></a><span>{text}</span></li>;
              })}
            </ol>
          </div>
          <p className="row" style={{ marginTop: 18 }}>
            <a className="btn" href={joinHref}>{inside ? t.events : t.join}</a>
            {!inside && <a className="btn ghost" href="/login">{t.signIn}</a>}
            {inside && !member && <a className="btn ghost" href="/app/membership">{t.becomeMember}</a>}
          </p>
        </div>
        <FlipCard front={t.cardLine} back={t.coreTeam} team={teamPhoto} hint={t.flipHint} soon={t.whoWeAre} />
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

      {/* Pick a mood: the two ways to join in */}
      <section className="mood-pick">
        <div className="between"><span className="label">02 / 09</span><span className="label">{t.moodKicker}</span></div>
        <h2>{t.moodTitle}</h2>
        <div className="mood-cards">
          <a className="mood-card" href={eventsHref("weekly")}>
            <span className="label">{t.weeklyLabel} · {t.playTitle}</span>
            <strong>{t.moodMove}</strong>
            <span>{t.playText}</span>
            <em>{t.findPlan}</em>
          </a>
          <a className="mood-card plum" href={eventsHref("fusion")}>
            <span className="label">{t.monthlyLabel} · {t.monthlyBadge}</span>
            <strong>{t.moodMeet}</strong>
            <span>{t.fusionCardText}</span>
            <em>{t.seeFusion}</em>
          </a>
        </div>
        {askEnabled() && (
          <div style={{ marginTop: 16 }}>
            <AskBox examples={t.askExamples} labels={{ askTitle: t.askOr, askPlaceholder: t.askPlaceholder, askButton: t.askButton, askThinking: t.askThinking, askError: t.askError, askNote: t.askNote }} />
          </div>
        )}
      </section>

      <div className="ticker" aria-label="Sports">
        <span>{SPORTS_TICKER.repeat(4)}</span>
      </div>

      <section className="bignums" aria-label={t.numbersTitle}>
        <div className="between"><span className="label">03 / 09</span><span className="label">{t.numbersKicker}</span></div>
        <h2>{t.numbersTitle}</h2>
        <div className="bignums-grid">
          <div><b>{move.playHours}</b><span>{t.statHours}</span></div>
          <div><b>{move.socialHours}</b><span>{t.statSocialHours}</span></div>
          <div><b>{move.km}</b><span>{t.statKm}</span></div>
          {stats.girls > 0 && <div><b>{stats.girls}</b><span>{t.statGirls}</span></div>}
          {stats.partners > 0 && <div><b>{stats.partners}</b><span>{t.statPartners}</span></div>}
          <div><b>{move.eventsHeld}</b><span>{t.statEventsHeld}</span></div>
        </div>
      </section>

      <section className="steps">
        {t.steps.map(([title, text], i) => (
          <div className="step" key={title}>
            <span className="label">{t.stepN} {i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      {/* 02 · Next plans */}
      <section className="section">
        <div className="between"><span className="label">04 / 09</span><span className="label">{t.nextPlans}</span></div>
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
                      {cover(e) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="plan-thumb" src={cover(e)!} alt="" loading="lazy" />
                      ) : (
                        <span className="plan-thumb blank" aria-hidden="true">{(e.sport ?? e.title).slice(0, 1)}</span>
                      )}
                      <span className="plan-text">
                        <strong>{e.title}</strong>
                        <span className="meta">{formatDateTime(e.startsAt, locale)}{e.partner ? ` · ${e.partner.name}` : e.place ? ` · ${e.place}` : ""}</span>
                      </span>
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
                {fusionCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fusion-cover" src={fusionCover} alt={`${nextFusion.title} poster`} loading="lazy" />
                ) : (
                  <span className="fusion-cover evcover fusion" aria-hidden="true">
                    <span>Fusion</span>
                    <strong>{nextFusion.title}</strong>
                  </span>
                )}
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

      {/* Captains: who can, how to sign up, what she does */}
      <section className="section captain-home">
        <div className="between"><span className="label">05 / 09</span><span className="label">{t.capHomeKicker}</span></div>
        <h2 className="display-md">{t.capHomeTitle}</h2>
        <p style={{ maxWidth: "62ch" }}>{t.capHomeIntro}</p>
        <p className="meta">{t.capHomeWho}</p>
        <div className="captain-home-grid">
          <div>
            <h3>{t.capHomeHowTitle}</h3>
            <ol className="cap-steps">{t.capHomeHow.map((x) => <li key={x}>{x}</li>)}</ol>
          </div>
          <div>
            <h3>{t.capHomeDoTitle}</h3>
            <ul className="cap-do">{t.capHomeDo.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
        <p style={{ marginTop: 16 }}>
          {!inside ? (
            <a className="btn pink" href="/join">{t.join}</a>
          ) : member ? (
            <a className="btn pink" href="/app?kind=weekly">{t.capHomeCta}</a>
          ) : (
            <a className="btn pink" href="/app/membership">{t.capHomeMember}</a>
          )}
        </p>
      </section>

      {/* 03 · Moments */}
      <section className="section">
        <div className="between"><span className="label">06 / 09</span><span className="label">Moments</span></div>
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
        <div className="between"><span className="label">07 / 09</span><span className="label">{t.partnersKicker}</span></div>
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
            <div className="between"><span className="label">08 / 09</span><span className="label">{t.membership}</span></div>
            <h2 className="display-md">{t.bandTitle}</h2>
            <p>{t.bandText}</p>
            <ul className="ticks">{t.memberPerks.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
          <div className="band-price">
            <p className="price">{MEMBERSHIP_MKD} <small>MKD</small></p>
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
          <div className="between" style={{ width: "100%" }}><span className="label">09 / 09</span><span className="label">{t.finaleTitle}</span></div>
          <span className="badge big"><Queens /></span>
          <h2 className="display">{t.finaleTitle}</h2>
          <p className="tagline">{t.tagline}</p>
          <p><a className="btn pink" href={joinHref}>{inside ? t.events : t.createProfile}</a></p>
        </div>
      </section>
    </>
  );
}
