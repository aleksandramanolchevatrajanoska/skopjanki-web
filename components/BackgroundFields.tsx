import { BACKGROUNDS, dicts, type Locale } from "@/lib/i18n";

/** Skills (free text) and background (one of a list, so Community can filter by it). */
export function BackgroundFields({ locale, skills, background }: { locale: Locale; skills?: string | null; background?: string | null }) {
  const t = dicts[locale];
  return (
    <div className="two">
      <div>
        <label htmlFor="background">{t.backgroundLabel}</label>
        <select id="background" name="background" defaultValue={background ?? ""}>
          <option value="">–</option>
          {BACKGROUNDS.map((b) => <option key={b} value={b}>{t.backgroundNames[b]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="skills">{t.skillsLabel}</label>
        <input id="skills" name="skills" maxLength={200} defaultValue={skills ?? ""} placeholder={t.skillsPlaceholder} />
      </div>
    </div>
  );
}

export function readBackground(form: FormData) {
  const b = String(form.get("background") ?? "");
  return { skills: String(form.get("skills") ?? "").trim().slice(0, 200) || null, background: BACKGROUNDS.includes(b) ? b : null };
}
