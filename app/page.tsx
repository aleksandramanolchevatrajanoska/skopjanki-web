import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { formatDateTime } from "@/lib/time";
import { Queens } from "@/components/Queens";

const SPORTS_TICKER = "Tennis · Padel · Aerial · Yoga · Pilates · Volleyball · Football · Running · Hiking · ";

export default async function Home() {
  const user = await currentUser();
  const { t, locale } = await getT(user?.locale);
  const inside = user?.status === "APPROVED";
  const member = isMember(user);
  const now = new Date();
  const [partners, nextFusion, nextPlans] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findFirst({ where: { kind: "FUSION", status: "APPROVED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, include: { partner: true } }),
    prisma.event.findMany({
      where: { kind: { not: "FUSION" }, status: "APPROVED", startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { partner: true },
    }),
  ]);
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
          {locale === "en" && <p className="lead">{t.heroIntro}</p>}
          <p className="lead" lang="mk">{t.heroMk}</p>
          <p className="row" style={{ marginTop: 18 }}>
            <a className="btn" href={joinHref}>{inside ? t.events : t.join}</a>
            {!inside && <a className="btn ghost" href="/login">{t.signIn}</a>}
            {inside && !member && <a className="btn ghost" href="/app/membership">{t.becomeMember}</a>}
          </p>
        </div>
        <div className="next-card" aria-hidden="true">
          <span className="badge"><Queens /></span>
          <span>
            <span className="ft">{t.cardLine}</span>
            <small>@skopjankii</small>
          </span>
        </div>
      </section>

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
      </section>

      <div className="ticker" aria-label="Sports">
        <span>{SPORTS_TICKER.repeat(4)}</span>
      </div>

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
        <div className="moments">
          <figure className="polaroid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/sip.jpg" alt="Sip & Serve: tennis and wine at Tennis Park Pointer" />
            <figcaption className="label">Sip &amp; Serve · 23 October</figcaption>
          </figure>
          <figure className="polaroid tilt-r">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/asanas.jpg" alt="Asanas and Mimosas: yoga and brunch" />
            <figcaption className="label">Asanas and Mimosas · 21 November</figcaption>
          </figure>
        </div>
      </section>

      {/* 04 · Partners */}
      <section className="section">
        <div className="between"><span className="label">04 / 06</span><span className="label">{t.partnersKicker}</span></div>
        <h2 className="display-md">{t.partnersTitle}</h2>
        <p className="meta">{t.partnersText}</p>
        {partners.length === 0 ? (
          <p className="meta" style={{ marginTop: 12 }}>{t.partnersEmpty}</p>
        ) : (
          <div className="partner-grid">
            {partners.map((p) => (
              <div className="partner" key={p.id}>
                <h3>{p.name}</h3>
                <p className="meta">{p.activity}</p>
                {p.address && <p className="meta">{p.address}</p>}
                <p className="row" style={{ gap: 12 }}>
                  {p.mapsUrl && <a href={p.mapsUrl}>Maps</a>}
                  {p.instagram && <a href={`https://instagram.com/${p.instagram.replace(/^@/, "")}`}>@{p.instagram.replace(/^@/, "")}</a>}
                </p>
              </div>
            ))}
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
