import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isMember } from "@/lib/membership";
import { Queens } from "@/components/Queens";

export const metadata: Metadata = {
  title: "Членска картичка · Скопјанки",
  description: "Твојата членска картичка и како да го користиш сајтот на Скопјанки.",
  robots: { index: false },
};

const STEPS: [string, string, string?, string?][] = [
  ["Најави се", "Отвори skopjanki.com и најави се со мејлот на кој ти стигна оваа картичка. Ти праќаме линк за најава; ако го нема, погледни во Spam или Promotions.", "/login", "Најава"],
  ["Пополни го профилот", "Твоите спортови и ниво, интереси, вештини и позадина. Така другите девојки те наоѓаат во Заедница.", "/app/profile", "Мој профил"],
  ["Пријави се на термин", "Во Play for fun се неделните спортови и работилниците, во Fusion настани спорт и дружење. Како членка имаш 48 часа предност пред другите.", "/app?kind=weekly", "Play for fun"],
  ["Користи ги попустите", "Минимум 20% кај партнерите и 10% на другите неделни активности. Покажи ја оваа картичка кај партнерите.", "/app/partners", "Партнери"],
  ["Биди капитенка", "На термин со ознака ♛ Бара капитенка притисни „Пријави се како капитенка“. Ги пречекуваш девојките и учествуваш бесплатно.", undefined, undefined],
  ["Предложи план или работилница", "Еднаш неделно можеш да предложиш свој план или да држиш работилница на тема што ја знаеш, бесплатна или платена.", "/app/propose", "Предложи"],
  ["Покажи го твојот мал бизнис", "Ако имаш свој бренд, објави го бесплатно во Бизниси на членки и дај попуст на другите членки.", "/app/biznisi", "Бизниси на членки"],
  ["Чат и newsletter", "Секој настан има чат за пријавените девојки. Секој понеделник добиваш newsletter со настаните, tip of the week и интересен факт.", undefined, undefined],
];

/** A member's own one-page card: her card on top, how the site works below. Reached by a secret link. */
export default async function MemberCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await prisma.user.findUnique({ where: { memberCardToken: token } });
  if (!u || u.status !== "APPROVED") notFound();
  const active = isMember(u);
  const no = `SK-${String(u.memberNumber ?? 0).padStart(3, "0")}`;
  const until = u.memberUntil?.toLocaleDateString("mk-MK", { timeZone: "Europe/Skopje", day: "numeric", month: "long", year: "numeric" });
  const first = u.name.split(/\s+/)[0];
  return (
    <div className="standalone onepager">
      <header className="standalone-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Скопјанки – Active Girls Club" />
      </header>

      <section className={`member-card-big${active ? "" : " expired"}`} aria-label="Членска картичка">
        <div className="between">
          <span className="label">Членска картичка</span>
          <span className="badge" style={{ width: 48, height: 48 }}><Queens /></span>
        </div>
        <div>
          <p className="mc-name">{u.name}</p>
          <p className="mc-meta">{no}{active ? (until ? ` · важи до ${until}` : "") : " · членството е истечено"}</p>
        </div>
        <p className="mc-foot">Skopjanki · Active Girls Club · Скопје</p>
      </section>
      <p className="meta onepager-hint">Зачувај ја оваа страна (или направи screenshot) и покажи ја картичката кај партнерите.</p>

      <section>
        <h1 className="onepager-title">Добредојде, {first} ♛</h1>
        <p className="lead">Ти благодарам што си меѓу првите членки на Скопјанки. Еве како да го искористиш клубот најдобро.</p>
      </section>

      <ol className="onepager-steps">
        {STEPS.map(([title, text, href, cta]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
            {href && <a className="btn sm ghost" href={href}>{cta} →</a>}
          </li>
        ))}
      </ol>

      <section className="onepager-foot">
        <p>Прашања? Пиши ни на Instagram <a href="https://instagram.com/skopjankii">@skopjankii</a>.</p>
        <p className="mc-sign">Се гледаме на терен ♛</p>
      </section>
    </div>
  );
}
