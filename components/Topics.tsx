import { TOPICS, dicts, type Locale } from "@/lib/i18n";

/** Checkbox chips for the topics a girl cares about, plus her own. */
export function TopicsFields({ locale, value = [] }: { locale: Locale; value?: string[] }) {
  const t = dicts[locale];
  const own = value.filter((v) => !TOPICS.includes(v));
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: ".88rem", margin: "16px 0 8px" }}>{t.myTopics}</legend>
      <div className="row">
        {TOPICS.map((k) => (
          <label key={k} className="chipbox" style={{ margin: 0, fontWeight: 400 }}>
            <input type="checkbox" name="topics" value={k} defaultChecked={value.includes(k)} />
            <span>{t.topicNames[k]}</span>
          </label>
        ))}
      </div>
      <label htmlFor="ownTopics">{t.otherTopics}</label>
      <input id="ownTopics" name="ownTopics" defaultValue={own.join(", ")} maxLength={160} placeholder="керамика, шах, подкасти" />
    </fieldset>
  );
}

export function readTopics(form: FormData) {
  const picked = form.getAll("topics").map(String).filter((k) => TOPICS.includes(k));
  const own = String(form.get("ownTopics") ?? "")
    .split(",")
    .map((s) => s.trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 5);
  return Array.from(new Set([...picked, ...own]));
}

export function topicLabel(k: string, locale: Locale) {
  return dicts[locale].topicNames[k] ?? k;
}
