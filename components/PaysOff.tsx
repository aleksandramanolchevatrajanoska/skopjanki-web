import { dicts, type Locale } from "@/lib/i18n";
import { MEMBERSHIP_MKD } from "@/lib/membership";

/** One month, worked out line by line: what two uses of partner codes save, against the membership. */
const EXAMPLE = [
  { key: "tennis", price: 1600, pct: 30 },
  { key: "feelgood", price: 700, pct: 28 },
] as const;

export function PaysOff({ locale }: { locale: Locale }) {
  const t = dicts[locale];
  const rows = EXAMPLE.map((r) => ({ ...r, saved: Math.round((r.price * r.pct) / 100) }));
  const total = rows.reduce((s, r) => s + r.saved, 0);
  const fmt = (n: number) => n.toLocaleString(locale === "mk" ? "mk-MK" : "en-GB");
  return (
    <div className="paysoff">
      <p className="label" style={{ marginTop: 14 }}>{t.paysOffTitle}</p>
      <p className="meta" style={{ margin: "2px 0 8px" }}>{t.paysOffIntro}</p>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{t.paysOffItems[r.key]} <span className="meta">({fmt(r.price)} {t.mkd}, −{r.pct}%)</span></td>
              <td className="num">−{fmt(r.saved)} {t.mkd}</td>
            </tr>
          ))}
          <tr className="sum">
            <td>{t.paysOffSaved}</td>
            <td className="num">{fmt(total)} {t.mkd}</td>
          </tr>
          <tr>
            <td>{t.paysOffMembership}</td>
            <td className="num">{fmt(MEMBERSHIP_MKD)} {t.mkd}</td>
          </tr>
        </tbody>
      </table>
      <p className="paysoff-result">✓ {t.paysOffResult}</p>
    </div>
  );
}
