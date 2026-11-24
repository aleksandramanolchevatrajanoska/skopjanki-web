import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";

export const metadata = { title: "Privacy · Skopjanki" };

const en = {
  title: "Privacy policy",
  draft: "Draft for the organiser to review before launch (have it checked against the Macedonian personal data law, ZZLP).",
  sections: [
    ["Who we are", "Skopjanki – Active Girls Club, Skopje. Contact: Instagram @skopjankii."],
    ["What we keep", "Your name, email, phone and Instagram (optional), how you heard about us, your sports and levels, a short bio, your sign-ups, attendance and payments, any open debt or credit, your quote and the photos you add."],
    ["Why", "To run the club: approve members, organise plans, split costs, send sign-in links, reminders and the monthly email."],
    ["Who sees what", "The organiser sees everything needed to run the club. Girls in the club see your name in “Who's going”, and in Community your name, bio, sports and Instagram if you allow it (Profile). Partners get the list of names for their term. Photos are seen only by girls in the club, unless the organiser makes one public on the home page."],
    ["Services we use", "Vercel (hosting), Supabase (database), Resend (email), Stripe (online payments). Questions typed into “Ask Skopjanki” are sent to Anthropic to write the answer and are not stored by us."],
    ["Your choices", "You can change your profile, hide yourself from Community, stop the monthly email, remove your quote, and photos, and delete your account at any time in My profile."],
  ],
};
const mk: typeof en = {
  title: "Политика за приватност",
  draft: "Нацрт што организаторката треба да го прегледа пред лансирање (да се провери според Законот за заштита на личните податоци).",
  sections: [
    ["Кои сме", "Skopjanki – Active Girls Club, Скопје. Контакт: Instagram @skopjankii."],
    ["Што чуваме", "Име, email, телефон и Instagram (по избор), од каде дозна за нас, спортови и нивоа, кратко био, пријави, присуство и плаќања, долг или кредит, твојата реченица и фотографиите што ги додаваш. Членките што сакаат разгледница даваат и поштенска адреса."],
    ["Зошто", "За да работи клубот: одобрување, организирање планови, делење на трошоците, линкови за најава, потсетници, месечен email и праќање на разгледницата."],
    ["Кој што гледа", "Организаторката гледа сè што е потребно за клубот. Девојките од клубот го гледаат твоето име во „Кој доаѓа“, а во Заедница име, био, спортови и Instagram ако дозволиш (Профил). Партнерите ја добиваат листата со имиња за нивниот термин. Адресата ја гледаш само ти и организаторката. Фотографиите ги гледаат само девојките од клубот, освен ако организаторката не направи некоја јавна на почетната страна."],
    ["Услуги што ги користиме", "Vercel (хостинг), Supabase (база), Resend (email), Stripe (онлајн плаќање). Прашањата во „Прашај ја Skopjanki“ се праќаат до Anthropic за да се напише одговорот и не ги чуваме."],
    ["Твој избор", "Во Мој профил можеш да го смениш профилот, да се сокриеш од Заедница, да го исклучиш месечниот email, да ги избришеш реченицата, фотографиите и адресата, и да го избришеш профилот во секое време."],
  ],
};

export default async function Privacy() {
  const user = await currentUser();
  const { locale } = await getT(user?.locale);
  const c = locale === "mk" ? mk : en;
  return (
    <article style={{ maxWidth: 720 }}>
      <h1>{c.title}</h1>
      <p className="notice">{c.draft}</p>
      {c.sections.map(([h, p]) => (
        <section key={h} style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: "1.3rem" }}>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
    </article>
  );
}
