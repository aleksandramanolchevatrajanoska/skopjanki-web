import { dicts, type Locale } from "@/lib/i18n";

/** Why membership is worth it, in one line. */
export function PaysOff({ locale }: { locale: Locale }) {
  return <p className="paysoff-line">{dicts[locale].paysOffLine}</p>;
}
