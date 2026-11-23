import { LEVELS, SPORTS, dicts, type Locale } from "@/lib/i18n";

/** One select per sport: the girl can be Advanced in padel and a Beginner in tennis. */
export function LevelsFields({ locale, value = {} }: { locale: Locale; value?: Record<string, string> }) {
  const t = dicts[locale];
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, fontSize: ".88rem", margin: "12px 0 4px" }}>{t.sportsLevels}</legend>
      <div className="two">
        {SPORTS.map((s) => (
          <div key={s} className="row" style={{ flexWrap: "nowrap" }}>
            <span style={{ minWidth: 92 }}>{s}</span>
            <select name={`level_${s}`} defaultValue={value[s] ?? ""} aria-label={s}>
              <option value="">–</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{t.levels[l]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function readLevels(form: FormData) {
  const levels: Record<string, string> = {};
  for (const s of SPORTS) {
    const v = String(form.get(`level_${s}`) ?? "");
    if (LEVELS.includes(v)) levels[s] = v;
  }
  return levels;
}
