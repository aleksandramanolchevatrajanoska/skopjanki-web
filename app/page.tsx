import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { formatDateTime } from "@/lib/time";
import { str } from "@/lib/act";
import { AppError } from "@/lib/services/common";
import { requestJoin } from "@/lib/services/users";
import { Flash } from "@/components/Flash";
import { LevelsFields, readLevels } from "@/components/LevelsFields";
import { getLocale } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { askEnabled } from "@/lib/ask";
import { AskBox, MomentCarousel, type Slide } from "@/components/Interactive";
import { PartnerCard } from "@/components/PartnerCard";
import { DAY, HOUR } from "@/lib/time";

async function join(form: FormData) {
  "use server";
  const locale = await getLocale();
  let dest = "/?ok=saved#join";
  try {
    const r = await requestJoin(prisma, {
      name: str(form.get("name")),
      email: str(form.get("email")),
      phone: str(form.get("phone")),
      instagram: str(form.get("instagram")),
      howHeard: str(form.get("howHeard")),
      levels: readLevels(form),
      locale,
    });
    if (r.status === "APPROVED") dest = "/login?ok=joinAlready";
  } catch (e) {
    if (e instanceof AppError) dest = `/?err=${e.code}#join`;
    else throw e;
  }
  redirect(dest);
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const inside = user?.status === "APPROVED";
  const member = isMember(user);
  const { t, locale } = await getT(user?.locale);
  const now = new Date();
  const [partners, nextFusion, nextPlans, moments, quotes] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findFirst({ where: { kind: "FUSION", status: "APPROVED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" } }),
    prisma.event.findMany({ where: { kind: { not: "FUSION" }, status: "APPROVED", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 3, include: { partner: true } }),
    // Moments: past events with photos. Visitors see only photos the organiser made public.
    prisma.event.findMany({
      where: { status: "APPROVED", startsAt: { lt: now }, photos: { some: inside ? {} : { public: true } } },
      orderBy: { startsAt: "desc" },
      take: 6,
      include: { partner: true, photos: { where: inside ? {} : { public: true }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 20 } },
    }),
    prisma.quote.findMany({ where: { hidden: false }, include: { user: { select: { name: true, memberUntil: true, isOwner: true } } }, orderBy: { updatedAt: "desc" }, take: 12 }),
  ]);
  const shownQuotes = quotes.filter((q) => isMember(q.user, now)).slice(0, 6);
  const untilFusion = nextFusion ? nextFusion.startsAt.getTime() - now.getTime() : 0;
  const firstName = (n: string) => n.split(/\s+/)[0];
  const weeks = [t.week1, t.week2, t.week3, t.week4];

  return (
    <>
      <section className="hero">
        <div>
          <p className="label" style={{ color: "#F2D3E2" }}>01 / 05 · Skopje</p>
          <h1>{t.heroTitle}</h1>
          <p className="script">{t.tagline}</p>
          <p>{t.heroIntro}</p>
          {locale === "en" && <p lang="mk" style={{ fontStyle: "italic" }}>{t.mkIntro}</p>}
          <p style={{ marginTop: 18 }} className="row">
            {inside ? (
              <>
                <a className="btn pink" href="/app">{t.events}</a>
                {!member && <a className="btn ghost" style={{ color: "#FFF9ED", borderColor: "#FFF9ED" }} href="/app/membership">{t.becomeMember}</a>}
              </>
            ) : (
              <>
                <a className="btn pink" href="#join">{t.join}</a>
                <a className="btn ghost" style={{ color: "#FFF9ED", borderColor: "#FFF9ED" }} href="/login">{t.signIn}</a>
              </>
            )}
          </p>
        </div>
        <div className="polaroid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/story.jpg" alt="Skopjanki girls after a game" />
        </div>
      </section>

      {sp.ok === "deleted" && <div className="notice ok" role="status">{t.deleted}</div>}
      {nextFusion && (
        <a className="countdown" href={inside ? `/app/events/${nextFusion.id}` : "#join"}>
          <span className="label">{t.countdownTo}</span>
          <strong>{nextFusion.title}</strong>
          <span>{formatDateTime(nextFusion.startsAt, locale)}</span>
          <span className="pill">{t.countdownIn} {Math.floor(untilFusion / DAY)}{t.days} {Math.floor((untilFusion % DAY) / HOUR)}{t.hoursShort}</span>
        </a>
      )}

      <section className="section two" style={{ alignItems: "center" }}>
        <div className="row">
          <a className="btn" href={inside ? "/app?kind=WEEKLY" : "#join"}>{t.moodMove} →</a>
          <a className="btn pink" href={inside ? "/app?kind=FUSION" : "#join"}>{t.moodMeet} →</a>
        </div>
        {askEnabled() && (
          <AskBox labels={{ askTitle: t.askTitle, askPlaceholder: t.askPlaceholder, askButton: t.askButton, askThinking: t.askThinking, askError: t.askError, askNote: t.askNote }} />
        )}
      </section>

      {(nextPlans.length > 0 || nextFusion) && (
        <section className="section two" style={{ alignItems: "stretch" }}>
          <div className="card">
            <p className="label">{t.monthTitle}</p>
            <h2>{t.upcoming}</h2>
            <ul className="plans">
              {nextPlans.map((e) => (
                <li key={e.id}>
                  <a href={inside ? `/app/events/${e.id}` : "#join"}><strong>{e.title}</strong></a>
                  <span className="meta">{formatDateTime(e.startsAt, locale)}{e.partner ? ` · ${e.partner.name}` : ""}</span>
                </li>
              ))}
              {nextPlans.length === 0 && <li className="meta">{t.noEvents}</li>}
            </ul>
          </div>
          <div className="plum">
            <p className="label" style={{ color: "#F2D3E2" }}>{t.fusionTitle}</p>
            {nextFusion ? (
              <>
                <h2>{nextFusion.title}</h2>
                <p>{formatDateTime(nextFusion.startsAt, locale)}</p>
                {nextFusion.description && <p style={{ whiteSpace: "pre-line" }}>{nextFusion.description}</p>}
                <p style={{ marginTop: 10 }}><a className="btn pink sm" href={inside ? `/app/events/${nextFusion.id}` : "#join"}>{inside ? t.seeEvent : t.join}</a></p>
              </>
            ) : <p>{t.fusionText}</p>}
          </div>
        </section>
      )}

      <section className="section">
        <p className="label">02 / 05</p>
        <h2>{t.monthTitle}</h2>
        <div className="weeks">
          {weeks.map((w, i) => (
            <div className="card" key={i}>
              <p className="label">{t.weekN} {i + 1}</p>
              <h3>{w}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="section two" style={{ alignItems: "stretch" }}>
        <div className="plum">
          <p className="label" style={{ color: "#F2D3E2" }}>03 / 05</p>
          <h2>{t.fusionTitle}</h2>
          <p>{t.fusionText}</p>
          <div className="row" style={{ marginTop: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/sip.jpg" alt="Sip & Serve: tennis and wine" style={{ width: "46%", borderRadius: 4 }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/asanas.jpg" alt="Asanas & Mimosas: yoga and brunch" style={{ width: "46%", borderRadius: 4 }} />
          </div>
        </div>
        <div className="card">
          <p className="label">04 / 05</p>
          <h2>{t.memberTitle}</h2>
          <ul className="ticks">{t.memberPerks.map((p) => <li key={p}>{p}</li>)}</ul>
          <h3 style={{ marginTop: 16 }}>{t.howTitle}</h3>
          <ol>{t.how.map((h) => <li key={h}>{h}</li>)}</ol>
        </div>
      </section>

      {moments.length > 0 && (
        <section className="section">
          <h2>{t.momentsTitle}</h2>
          <p className="meta">{t.momentsIntro}</p>
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
        </section>
      )}

      {shownQuotes.length > 0 && (
        <section className="section">
          <h2>{t.quotesTitle}</h2>
          <div className="quotes">
            {shownQuotes.map((q) => (
              <blockquote key={q.userId} className="card">
                <p>“{q.text}”</p>
                <footer className="meta">— {firstName(q.user.name)}</footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {partners.length > 0 && (
        <section className="section">
          <h2>{t.partnersTitle}</h2>
          <div className="grid">
            {partners.map((p) => <PartnerCard key={p.id} p={p} locale={locale} member={member} />)}
          </div>
        </section>
      )}

      {inside ? (
        <section className="section plum" style={{ textAlign: "center" }}>
          <h2>{member ? t.youreIn : t.memberTitle}</h2>
          <p className="row" style={{ justifyContent: "center", marginTop: 14 }}>
            <a className="btn pink" href="/app">{t.events}</a>
            {!member && <a className="btn ghost" style={{ color: "#FFF9ED", borderColor: "#FFF9ED" }} href="/app/membership">{t.becomeMember}</a>}
          </p>
        </section>
      ) : (
      <section className="section" id="join">
        <p className="label">05 / 05</p>
        <h2>{t.joinTitle}</h2>
        <p className="meta">{t.joinIntro}</p>
        <Flash sp={sp} locale={locale} />
        {sp.ok === "saved" ? (
          <div className="notice ok">{t.joinSent}</div>
        ) : (
          <form action={join} className="card" style={{ maxWidth: 640 }}>
            <div className="two">
              <div><label htmlFor="name">{t.name}</label><input id="name" name="name" required autoComplete="name" /></div>
              <div><label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
              <div><label htmlFor="phone">{t.phone}</label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
              <div><label htmlFor="instagram">{t.instagram}</label><input id="instagram" name="instagram" placeholder="@" /></div>
            </div>
            <label htmlFor="howHeard">{t.howHeard}</label>
            <input id="howHeard" name="howHeard" />
            <LevelsFields locale={locale} />
            <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">{t.send}</button></p>
          </form>
        )}
      </section>
      )}
    </>
  );
}
