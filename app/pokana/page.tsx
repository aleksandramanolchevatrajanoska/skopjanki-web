import { PaysOff } from "@/components/PaysOff";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { MEMBERSHIP_EUR, MEMBERSHIP_MKD } from "@/lib/membership";
import { cleanName, inviteSettings, LETTER_SIGNATURE } from "@/lib/services/invites";
import { Queens } from "@/components/Queens";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const name = cleanName((await searchParams).za);
  const title = name ? `Покана за ${name} · Скопјанки` : "Покана за членство · Скопјанки";
  const description = "Спорт, дружба, работилници и кул настани за девојки во Скопје. Засега само 30 места за членки.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Скопјанки", images: [{ url: "/og-pokana.png", width: 1200, height: 630, alt: "Покана за членство · Скопјанки" }] },
    twitter: { card: "summary_large_image", images: ["/og-pokana.png"] },
  };
}

/** A personal invitation card the organiser sends to each girl: skopjanki.com/pokana?za=Ана */
export default async function Invitation({ searchParams }: Props) {
  const name = cleanName((await searchParams).za);
  const { letter } = await inviteSettings(prisma);
  const t = dicts.mk;
  const tt = t;
  return (
    <div className="standalone invite">
      <header className="standalone-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Скопјанки – Active Girls Club" />
      </header>

      <section className="invite-card" aria-label={name ? `Покана за ${name}` : "Покана"}>
        <div className="between">
          <span className="label">{name ? "Лична покана" : "Покана за членство"}</span>
          <span className="badge" style={{ width: 48, height: 48 }}><Queens /></span>
        </div>
        <div>
          <p className="invite-to">{name ? `${name},` : "Здраво,"}</p>
          <p className="invite-big">те каниме во Скопјанки.</p>
        </div>
        <p className="invite-foot">Skopjanki · Active Girls Club · Скопје</p>
      </section>

      <section className="invite-letter">
        {letter.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
        <p className="invite-sign">{LETTER_SIGNATURE}</p>
      </section>

      <section>
        <span className="label">Како да се приклучиш</span>
        <ol className="onepager-steps" style={{ marginTop: 12 }}>
          <li><strong>Пријави се</strong><span>Кажи ни кои спортови ги сакаш, твоите интереси и, ако имаш, твојот мал бизнис.</span><a className="btn sm ghost" href="/?pokana=1">Сакам да се приклучам, но прво да ја видам платформата →</a></li>
          <li><strong>Добиваш мејл</strong><span>Организаторката ја одобрува секоја девојка. Ти стигнува мејл со линк за најава; ако го нема, погледни во Spam или Promotions.</span></li>
          <li><strong>Пробај еден месец, па стани членка</strong><span>Првиот месец доаѓаш на неделните активности без членарина. Потоа, за да продолжиш, треба да станеш членка: во „Членарина“ притисни „Сакам да станам членка“, ти праќаме линк за плаќање и добиваш своја членска картичка.</span></li>
          <li><strong>Дојди на терен</strong><span>Пријави се на неделен спорт, работилница или fusion настан. Членките имаат 48 часа предност и попуст.</span></li>
        </ol>
      </section>

      <section className="spots-box">
          <p className="label">{tt.trialTitle}</p>
          <p>{tt.trialText}</p>
          <p className="label" style={{ marginTop: 14 }}>{tt.spotsTitle}</p>
          <p>{tt.spotsText}</p>
          <p><strong>♛ {tt.priceLockText}</strong></p>
          <PaysOff locale={"mk"} />
          <p className="label" style={{ marginTop: 14 }}>{tt.whyTitle}</p>
          <p>{tt.whyText}</p>
        </section>

      <section className="invite-perks">
        <span className="label">Што добиваш како членка</span>
        <ul>{t.memberPerks.map((perk) => <li key={perk}>{perk}</li>)}</ul>
        <p className="invite-price"><strong>{MEMBERSHIP_MKD} ден. ({MEMBERSHIP_EUR} €)</strong> месечно · откажуваш кога сакаш</p>
      </section>

      <section className="invite-cta">
        <a className="btn pink" href="/?pokana=1">Сакам да се приклучам, но прво да ја видам платформата</a>
        <p className="meta">Прво се пријавуваш со име и мејл, организаторката те одобрува, па добиваш линк за најава.</p>
      </section>
    </div>
  );
}
