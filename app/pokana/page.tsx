import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { MEMBERSHIP_EUR, MEMBERSHIP_MKD } from "@/lib/membership";
import { cleanName, inviteSettings } from "@/lib/services/invites";
import { Queens } from "@/components/Queens";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const name = cleanName((await searchParams).za);
  return {
    title: name ? `Покана за ${name} · Скопјанки` : "Покана · Скопјанки",
    description: "Лична покана да станеш дел од Скопјанки, клуб за активни девојки во Скопје.",
  };
}

/** A personal invitation card the organiser sends to each girl: skopjanki.com/pokana?za=Ана */
export default async function Invitation({ searchParams }: Props) {
  const name = cleanName((await searchParams).za);
  const { letter } = await inviteSettings(prisma);
  const t = dicts.mk;
  return (
    <div className="standalone invite">
      <header className="standalone-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Скопјанки – Active Girls Club" />
      </header>

      <section className="invite-card" aria-label={name ? `Покана за ${name}` : "Покана"}>
        <div className="between">
          <span className="label">Лична покана</span>
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
        <p className="invite-sign">— основачката на Скопјанки ♛</p>
      </section>

      <section className="invite-perks">
        <span className="label">Што добиваш како членка</span>
        <ul>{t.memberPerks.map((perk) => <li key={perk}>{perk}</li>)}</ul>
        <p className="invite-price"><strong>{MEMBERSHIP_MKD} ден. ({MEMBERSHIP_EUR} €)</strong> месечно · откажуваш кога сакаш</p>
      </section>

      <section className="invite-cta">
        <a className="btn pink" href="/join">Сакам да се приклучам</a>
        <a className="btn ghost" href="/app/membership">Веќе сум во клубот, сакам членство</a>
        <p className="meta">Прво се пријавуваш со име и мејл, организаторката те одобрува, па добиваш линк за најава.</p>
      </section>
    </div>
  );
}
