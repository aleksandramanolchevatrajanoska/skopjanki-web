import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { MEMBERSHIP_EUR, MEMBERSHIP_MKD } from "@/lib/membership";

export const metadata = { title: "Terms and privacy · Skopjanki" };

const en = {
  title: "Terms and privacy",
  sections: [
    ["Who we are", "Skopjanki – Active Girls Club, Skopje. Contact: Instagram @skopjankii."],
    ["Your personal data (GDPR)", "We follow the GDPR and the Macedonian personal data law (ZZLP). We keep only what the club needs to work: your name, email, phone and Instagram (optional), your sports and interests, a short bio, your sign-ups, attendance and payments, and the photos you add. We never sell your data or give it to anyone for advertising, and we don't keep anything we don't need."],
    ["Payments", `We never see or keep your card details. Online payments go through Stripe, an official, certified payment provider (PCI DSS), on Stripe's own secure page. The membership is ${MEMBERSHIP_MKD} MKD (${MEMBERSHIP_EUR} €) a month.`],
    ["Cancel any time", "You can cancel your membership any time, with no fee: Membership → Cancel my membership. The monthly payment stops and your membership stays valid until the end of the month you paid."],
    ["Why we keep it", "To run the club: approve members, organise events, share costs, send sign-in links, reminders and the weekly email."],
    ["Who sees what", "The organiser sees what is needed to run the club. Girls in the club see your name in “Who's going”, and in Community your name, bio and interests if you allow it (Profile). Partners get the list of names for their term. Photos are seen only by girls in the club, unless the organiser makes one public on the home page."],
    ["Services we use", "Vercel (hosting), Supabase (database, in the EU), Resend (email), Stripe (payments). Questions typed into “Ask Skopjanki” are sent to Anthropic to write the answer and are not stored by us."],
    ["Your rights", "You can see and change your profile, hide yourself from Community, stop the weekly email, and delete your account and your data at any time in My profile. For anything else, write to us on Instagram @skopjankii."],
  ],
};
const mk: typeof en = {
  title: "Услови и приватност",
  sections: [
    ["Кои сме", "Skopjanki – Active Girls Club, Скопје. Контакт: Instagram @skopjankii."],
    ["Твоите лични податоци (GDPR)", "Се придржуваме до GDPR и Законот за заштита на личните податоци. Чуваме само она што му треба на клубот за да работи: име, email, телефон и Instagram (по избор), спортови и интереси, кратко био, пријави, присуство и плаќања, и фотографиите што ги додаваш. Никогаш не ги продаваме твоите податоци и не ги даваме никому за реклами, и не чуваме ништо што не ни треба."],
    ["Плаќање", `Никогаш не ги гледаме и не ги чуваме податоците од твојата картичка. Онлајн плаќањето оди преку Stripe, официјален и сертифициран провајдер за плаќање (PCI DSS), на нивната безбедна страница. Членарината е ${MEMBERSHIP_MKD} ден. (${MEMBERSHIP_EUR} €) месечно.`],
    ["Откажи кога сакаш", "Членарината можеш да ја откажеш во секое време, без трошок: Членство → Откажи ја членарината. Месечното плаќање запира, а членството ти важи до крајот на платениот месец."],
    ["Зошто ги чуваме", "За да работи клубот: одобрување, организирање настани, делење на трошоците, линкови за најава, потсетници и неделниот email."],
    ["Кој што гледа", "Организаторката гледа само она што е потребно за клубот. Девојките од клубот го гледаат твоето име во „Кој доаѓа“, а во Заедница име, био и интереси ако дозволиш (Профил). Партнерите ја добиваат листата со имиња за нивниот термин. Фотографиите ги гледаат само девојките од клубот, освен ако организаторката не направи некоја јавна на почетната страна."],
    ["Услуги што ги користиме", "Vercel (хостинг), Supabase (база, во ЕУ), Resend (email), Stripe (плаќање). Прашањата во „Прашај ја Skopjanki“ се праќаат до Anthropic за да се напише одговорот и не ги чуваме."],
    ["Твои права", "Во Мој профил можеш да го видиш и смениш профилот, да се сокриеш од Заедница, да го исклучиш неделниот email, и да го избришеш профилот и сите твои податоци во секое време. За сè друго, пиши ни на Instagram @skopjankii."],
  ],
};

export default async function Privacy() {
  const user = await currentUser();
  const { locale } = await getT(user?.locale);
  const c = locale === "mk" ? mk : en;
  return (
    <article style={{ maxWidth: 720 }}>
      <h1>{c.title}</h1>
      {c.sections.map(([h, p]) => (
        <section key={h} style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: "1.3rem" }}>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </article>
  );
}
