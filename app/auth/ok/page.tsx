import { headers } from "next/headers";
import { getT } from "@/lib/i18n";
import { appUrl } from "@/lib/email";

export const metadata = { robots: { index: false } };

/** After a sign-in link on a phone: continue here, or open the same link in Safari / Chrome. */
export default async function SignedIn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token = "" } = await searchParams;
  const { t } = await getT();
  const ua = (await headers()).get("user-agent") ?? "";
  const link = appUrl(`/auth/verify?token=${encodeURIComponent(token)}&ext=1`);
  const ios = /iPhone|iPad/i.test(ua);
  const android = /Android/i.test(ua);
  const external = ios
    ? link.replace(/^https:\/\//, "x-safari-https://")
    : android
      ? `intent://${link.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`
      : null;
  return (
    <div style={{ maxWidth: 440, margin: "40px auto", textAlign: "center" }}>
      <h1>{t.signedInTitle}</h1>
      <p style={{ marginTop: 18 }}><a className="btn pink wide" href="/">{t.signedInContinue}</a></p>
      {token && external && (
        <div className="notice" style={{ marginTop: 22, textAlign: "left" }}>
          <p style={{ margin: 0 }}>{t.signedInInApp}</p>
          <p style={{ margin: "10px 0 0" }}><a className="btn ghost sm" href={external}>{ios ? t.openInSafari : t.openInChrome}</a></p>
        </div>
      )}
    </div>
  );
}
