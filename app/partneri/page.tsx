import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { int, str } from "@/lib/act";
import { AppError } from "@/lib/services/common";
import { submitPartnerApplication } from "@/lib/services/partners";

export const metadata: Metadata = {
  title: "Станете партнер на Скопјанки",
  description: "Пријава за партнери: спортски терени, студија, кафулиња и брендови.",
};

const SPORTS = ["Тенис", "Падел", "Фудбал", "Одбојка", "Јога", "Пилатес", "Аеријал", "Друго"];
const DAYS = ["Пон", "Вто", "Сре", "Чет", "Пет", "Саб", "Нед"];
const KINDS = ["Спортски терен", "Спортско студио / фитнес", "Јога / пилатес / танц", "Салон за убавина / спа", "Кафуле / ресторан / бар", "Винарија", "Продавница / спортска опрема", "Креативна работилница", "Простор за настани", "Фирма / компанија", "Друго"];
const OFFERS: [string, string, string][] = [
  ["discount_session", "Попуст на термини / услуги", "Колку што максимално можете."],
  ["discount_gear", "Попуст на опрема / производи", "Во продавница или онлајн, со промо код."],
  ["free_trial", "Бесплатен пробен термин или ваучери", "Првиот час бесплатно, ваучери за наградни игри."],
  ["space", "Простор за наши активности", "Бесплатно или по намалена цена."],
  ["gifts", "Подароци / производи за настани", "Гифт пакети, мостри, вино за дегустација."],
  ["other", "На друг начин", "Опишете го подолу во пораката."],
];
const ERR: Record<string, string> = {
  BAD_INPUT: "Пополнете ги полињата означени со * (име на бизнис, вид, контакт, телефон, е-пошта).",
  CONSENT_REQUIRED: "Потврдете ја согласноста на крајот од формата.",
  OFFER_REQUIRED: "Изберете барем еден начин на кој сакате да придонесете.",
};

async function apply(form: FormData) {
  "use server";
  if (str(form.get("website_confirm"))) redirect("/partneri?ok=1"); // honeypot for bots
  let dest = "/partneri?ok=1";
  try {
    await submitPartnerApplication(prisma, {
      business: str(form.get("business")), kind: str(form.get("kind")), address: str(form.get("address")),
      person: str(form.get("person")), phone: str(form.get("phone")), email: str(form.get("email")),
      instagram: str(form.get("instagram")), website: str(form.get("website")),
      sports: form.getAll("sports").map(String),
      priceRegular: int(form.get("priceRegular")), priceGroup: int(form.get("priceGroup")), durationMin: int(form.get("durationMin")),
      pricing: str(form.get("pricing")), perUnit: int(form.get("perUnit")), units: int(form.get("units")),
      captainFree: str(form.get("captainFree")),
      offers: form.getAll("offers").map(String), discountPct: int(form.get("discountPct")), gearPct: int(form.get("gearPct")),
      hostWeekly: form.get("hostWeekly") === "on", hostFusion: form.get("hostFusion") === "on",
      capacity: int(form.get("capacity")), days: form.getAll("days").map(String), times: str(form.get("times")),
      message: str(form.get("message")), consent: form.get("consent") === "on",
    });
  } catch (e) {
    if (e instanceof AppError) dest = `/partneri?err=${e.code}#forma`;
    else throw e;
  }
  redirect(dest);
}

function Chip({ name, value, type = "checkbox" }: { name: string; value: string; type?: "checkbox" | "radio" }) {
  return (
    <label className="chipbox">
      <input type={type} name={name} value={value} />
      <span>{value}</span>
    </label>
  );
}

export default async function Partneri({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (sp.ok) {
    return (
      <div className="card tilt" style={{ maxWidth: 560, margin: "40px auto" }}>
        <h1>Ви благодариме!</h1>
        <p>Пријавата е примена. Ќе ве контактираме во наредните денови.</p>
        <p className="meta">Скопјанки · <a href="https://instagram.com/skopjankii">@skopjankii</a></p>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }} className="stack">
      <section className="hero" style={{ display: "block" }}>
        <p className="label" style={{ color: "#F49BBC" }}>Партнерска програма</p>
        <h1>Станете партнер на <em style={{ color: "#F49BBC" }}>Скопјанки</em></h1>
        <p style={{ marginTop: 10 }}>Секоја недела организираме спортска активност, а еднаш месечно fusion настан. Бараме места каде што ќе доаѓаме редовно. За членките понудете попуст колку што максимално можете, а ние ве носиме пред заедницата на Скопјанки.</p>
      </section>
      <div className="grid" style={{ marginTop: 0 }}>
        <div className="card" style={{ borderTop: "4px solid var(--pink)" }}><h3>Редовни термини</h3><p className="meta">Минимум еднаш неделно доаѓаме кај вас, со група девојки.</p></div>
        <div className="card" style={{ borderTop: "4px solid var(--pink)" }}><h3>Видливост</h3><p className="meta">Ве ставаме како партнер на нашата страна и објавуваме на Instagram со таг и локација.</p></div>
        <div className="card" style={{ borderTop: "4px solid var(--court)" }}><h3>Fusion настани</h3><p className="meta">Можете да бидете домаќин на некој од нашите месечни fusion настани.</p></div>
      </div>

      <form action={apply} id="forma" className="stack" style={{ marginTop: 20 }}>
        {sp.err && <div className="notice err" role="alert">{ERR[sp.err] ?? ERR.BAD_INPUT}</div>}
        <input type="text" name="website_confirm" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999 }} />

        <section className="card">
          <p className="label">01 / 05</p><h2>За вас</h2>
          <div className="two">
            <div style={{ gridColumn: "1/-1" }}><label htmlFor="business">Име на бизнисот *</label><input id="business" name="business" required /></div>
            <div><label htmlFor="kind">Вид на бизнис *</label><select id="kind" name="kind" required defaultValue=""><option value="" disabled>Изберете…</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div><label htmlFor="address">Адреса</label><input id="address" name="address" placeholder="пр. Центар, ул. Македонија 12" /></div>
            <div><label htmlFor="person">Лице за контакт *</label><input id="person" name="person" required autoComplete="name" /></div>
            <div><label htmlFor="phone">Телефон *</label><input id="phone" name="phone" type="tel" required placeholder="07x xxx xxx" autoComplete="tel" /></div>
            <div><label htmlFor="email">Е-пошта *</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div><label htmlFor="instagram">Instagram</label><input id="instagram" name="instagram" placeholder="@vashiot.profil" /></div>
            <div style={{ gridColumn: "1/-1" }}><label htmlFor="website">Веб-страна или Google Maps линк</label><input id="website" name="website" type="url" placeholder="https://" /></div>
          </div>
        </section>

        <section className="card">
          <p className="label">02 / 05</p><h2>Термини и цени</h2>
          <p className="meta">За спортски терени и студија. Ако не нудите термини, прескокнете.</p>
          <label>Кои спортови / часови нудите?</label>
          <div className="row">{SPORTS.map((s) => <Chip key={s} name="sports" value={s} />)}</div>
          <div className="two">
            <div><label htmlFor="priceRegular">Редовна цена (ден.)</label><input id="priceRegular" name="priceRegular" type="number" min={0} step={50} placeholder="пр. 1600" /></div>
            <div><label htmlFor="durationMin">Траење (мин.)</label><input id="durationMin" name="durationMin" type="number" min={15} step={15} placeholder="пр. 90" /></div>
            <div><label htmlFor="priceGroup">Цена за група од Скопјанки (ден.)</label><input id="priceGroup" name="priceGroup" type="number" min={0} step={50} placeholder="пр. 1300" /></div>
            <div><label htmlFor="pricing">Цената е</label><select id="pricing" name="pricing" defaultValue=""><option value="">Изберете…</option><option>по терен</option><option>по девојка</option></select></div>
            <div><label htmlFor="perUnit">Најмногу девојки на еден терен / час</label><input id="perUnit" name="perUnit" type="number" min={1} placeholder="пр. 4" /></div>
            <div><label htmlFor="units">Колку терени одеднаш</label><input id="units" name="units" type="number" min={1} placeholder="пр. 2" /></div>
          </div>
          <label>Капитенката на групата (наша членка што ги пречекува девојките) може да игра бесплатно?</label>
          <div className="row">{["Да", "Не", "Да разговараме"].map((v) => <Chip key={v} name="captainFree" value={v} type="radio" />)}</div>
        </section>

        <section className="card">
          <p className="label">03 / 05</p><h2>Што нудите за членките? *</h2>
          <p className="meta">Попустот важи само за членки на Скопјанки и само за термини што ги организираме ние.</p>
          {OFFERS.map(([v, t, d]) => (
            <label key={v} className="optbox">
              <input type="checkbox" name="offers" value={v} />
              <span><strong>{t}</strong><span className="meta" style={{ display: "block" }}>{d}</span></span>
              {v === "discount_session" && <span className="row" style={{ marginLeft: "auto" }}><input name="discountPct" type="number" min={1} max={100} defaultValue={20} style={{ width: 80 }} aria-label="Попуст на термини во %" /> %</span>}
              {v === "discount_gear" && <span className="row" style={{ marginLeft: "auto" }}><input name="gearPct" type="number" min={1} max={100} defaultValue={10} style={{ width: 80 }} aria-label="Попуст на опрема во %" /> %</span>}
            </label>
          ))}
        </section>

        <section className="card">
          <p className="label">04 / 05</p><h2>Кога можеме да доаѓаме?</h2>
          <label className="optbox"><input type="checkbox" name="hostWeekly" /><span><strong>Отворени сме за неделни термини</strong><span className="meta" style={{ display: "block" }}>Редовен термин минимум еднаш неделно.</span></span></label>
          <label className="optbox"><input type="checkbox" name="hostFusion" /><span><strong>Сакаме да бидеме домаќин на fusion настан</strong><span className="meta" style={{ display: "block" }}>Спорт и дружење заедно, како Sip &amp; Serve или Asanas &amp; Mimosas.</span></span></label>
          <div className="two">
            <div><label htmlFor="capacity">Вкупен капацитет за настан (луѓе)</label><input id="capacity" name="capacity" type="number" min={1} placeholder="пр. 20" /></div>
            <div><label htmlFor="times">Најдобро време</label><select id="times" name="times" defaultValue=""><option value="">Изберете…</option><option>Наутро (до 12 ч.)</option><option>Попладне (12–17 ч.)</option><option>Вечер (по 17 ч.)</option><option>Флексибилно</option></select></div>
          </div>
          <label>Достапни денови</label>
          <div className="row">{DAYS.map((d) => <Chip key={d} name="days" value={d} />)}</div>
        </section>

        <section className="card">
          <p className="label">05 / 05</p><h2>Нешто повеќе</h2>
          <label htmlFor="message">Ваша порака</label>
          <textarea id="message" name="message" rows={4} placeholder="Каква соработка замислувате? Ако избравте „На друг начин“, опишете го тука." />
          <label className="optbox" style={{ marginTop: 12 }}><input type="checkbox" name="consent" required /><span>Се согласувам Скопјанки да го користат името, логото и Instagram профилот на нашиот бизнис за партнерска промоција на нивната страна и Instagram. *</span></label>
          <p style={{ marginTop: 14 }}><button className="btn pink" type="submit">Испрати пријава</button></p>
        </section>
      </form>
    </div>
  );
}
