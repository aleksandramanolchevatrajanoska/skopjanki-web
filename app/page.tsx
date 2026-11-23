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
  if (user?.status === "APPROVED" && !sp.ok && !sp.err) redirect("/app");
  const { t, locale } = await getT(user?.locale);
  const [partners, nextFusion] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findFirst({ where: { kind: "FUSION", status: "APPROVED", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
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
            <a className="btn pink" href="#join">{t.join}</a>
            <a className="btn ghost" style={{ color: "#FFF9ED", borderColor: "#FFF9ED" }} href="/login">{t.signIn}</a>
          </p>
        </div>
        <div className="polaroid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/story.jpg" alt="Skopjanki girls after a game" />
        </div>
      </section>

      {nextFusion && (
        <div className="notice">
          <strong>{t.fusionTitle}:</strong> {nextFusion.title} · {formatDateTime(nextFusion.startsAt, locale)}
        </div>
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

      {partners.length > 0 && (
        <section className="section">
          <h2>{t.partnersTitle}</h2>
          <div className="grid">
            {partners.map((p) => (
              <div className="card" key={p.id}>
                <h3>{p.name}</h3>
                <p className="meta">{p.activity}</p>
                {p.address && <p className="meta">{p.address}</p>}
                {p.instagram && <a href={`https://instagram.com/${p.instagram.replace(/^@/, "")}`}>@{p.instagram.replace(/^@/, "")}</a>}
              </div>
            ))}
          </div>
        </section>
      )}

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
    </>
  );
}
