import { redirect } from "next/navigation";
import { sendLoginLink } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n";
import { str } from "@/lib/act";
import { Flash } from "@/components/Flash";

async function login(form: FormData) {
  "use server";
  const locale = await getLocale();
  const ok = await sendLoginLink(str(form.get("email")), locale);
  redirect(ok ? "/login?ok=loginSent" : "/login?ok=loginUnknown");
}

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getT();
  return (
    <div style={{ maxWidth: 440, margin: "0 auto" }}>
      <h1>{t.loginTitle}</h1>
      <p className="meta">{t.loginIntro}</p>
      {sp.bad && <div className="notice err">{t.loginBad}</div>}
      <Flash sp={sp} locale={locale} />
      <form action={login} className="card" style={{ marginTop: 16 }}>
        <label htmlFor="email">{t.email}</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <p style={{ marginTop: 14 }}><button className="btn" type="submit">{t.signIn}</button></p>
      </form>
      <p className="meta" style={{ marginTop: 16 }}><a href="/#join">{t.join}</a></p>
      {process.env.DEMO_LOGIN === "1" && (
        <div className="notice" style={{ marginTop: 16 }}>
          Preview: <a href="/auth/demo?as=owner">sign in as the organiser</a> · <a href="/auth/demo?as=member">sign in as a member</a>
        </div>
      )}
    </div>
  );
}
