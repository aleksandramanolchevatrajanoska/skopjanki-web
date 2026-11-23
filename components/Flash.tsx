import { dicts, type Locale } from "@/lib/i18n";

export function Flash({ sp, locale }: { sp: Record<string, string | string[] | undefined>; locale: Locale }) {
  const t = dicts[locale];
  const err = typeof sp.err === "string" ? sp.err : null;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  if (err) return <div className="notice err" role="alert">{t.errors[err] ?? t.errors.BAD_INPUT}</div>;
  if (ok) {
    const msg = (t as unknown as Record<string, unknown>)[ok];
    return <div className="notice ok" role="status">{typeof msg === "string" ? msg : t.saved}</div>;
  }
  return null;
}
