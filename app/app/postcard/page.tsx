import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { monthKey, stampsThisMonth, STAMPS_FOR_SURPRISE } from "@/lib/services/club";
import { Flash } from "@/components/Flash";
import { PartnerCard } from "@/components/PartnerCard";

export default async function Postcard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const month = monthKey();
  const monthName = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(locale === "mk" ? "mk-MK" : "en-GB", { month: "long", year: "numeric" });

  if (!member) {
    // Non-members get a blurred sample only: the real content never reaches their browser.
    return (
      <>
        <h1>{t.postcardTitle}</h1>
        <p className="meta">{t.postcardIntro}</p>
        <div className="postcard locked" aria-hidden="true">
          <p className="label">{monthName}</p>
          <h2>Skopjanki · No. 00</h2>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p>
          <div className="two"><div className="card">♛ ♛ ♛</div><div className="card">SKOPJANKI-00</div></div>
        </div>
        <div className="notice" style={{ marginTop: -60, position: "relative" }}>
          <p>{t.postcardLocked}</p>
          <a className="btn pink" href="/app/membership">{t.becomeMember}</a>
        </div>
      </>
    );
  }

  const [nl, stamps, partners] = await Promise.all([
    prisma.newsletter.findUnique({ where: { month } }),
    stampsThisMonth(prisma, user.id),
    prisma.partner.findMany({ where: { active: true, OR: [{ code: { not: null } }, { offer: { not: null } }] }, orderBy: { name: "asc" }, include: { logo: { select: { updatedAt: true } } } }),
  ]);
  const unlocked = stamps >= STAMPS_FOR_SURPRISE;

  return (
    <>
      <h1>{t.postcardTitle}</h1>
      <p className="meta">{t.postcardIntro}</p>
      <Flash sp={sp} locale={locale} />

      <article className="postcard">
        <p className="label">{monthName}</p>
        {nl ? (
          <>
            <h2>{nl.headline}</h2>
            {nl.intro && <p style={{ whiteSpace: "pre-line" }}>{nl.intro}</p>}
            <div className="two" style={{ marginTop: 16 }}>
              {(nl.challengeTitle || nl.challengeText) && (
                <div className="card"><p className="label">{t.challengeOfMonth}</p><h3>{nl.challengeTitle}</h3><p>{nl.challengeText}</p></div>
              )}
              {nl.tip && <div className="card"><p className="label">{t.tipOfMonth}</p><p>{nl.tip}</p></div>}
            </div>
            {nl.gift && <p style={{ marginTop: 12 }}><span className="label">{t.giftOfMonth}:</span> {nl.gift}</p>}
          </>
        ) : (
          <p>{t.noPostcard}</p>
        )}
      </article>

      <section className="section two" style={{ alignItems: "start" }}>
        <div className="card">
          <p className="label">{t.stampCard}</p>
          <div className="stamps" aria-label={`${Math.min(stamps, STAMPS_FOR_SURPRISE)} / ${STAMPS_FOR_SURPRISE}`}>
            {Array.from({ length: STAMPS_FOR_SURPRISE }, (_, i) => <span key={i} className={i < stamps ? "on" : ""}>♛</span>)}
          </div>
          <p className="meta">{t.stampCardHint}</p>
        </div>
        <div className="card">
          <p className="label">{t.surpriseOfMonth}</p>
          {unlocked ? <p>{nl?.surprise ?? "♛"}</p> : <p className="meta">{t.surpriseLocked}</p>}
        </div>
      </section>

      {partners.length > 0 && (
        <section className="section">
          <h2>{t.partnersTitle}</h2>
          <div className="grid">{partners.map((p) => <PartnerCard key={p.id} p={p} locale={locale} member />)}</div>
        </section>
      )}

    </>
  );
}
