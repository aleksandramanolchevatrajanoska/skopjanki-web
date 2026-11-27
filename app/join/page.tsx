import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getLocale, getT } from "@/lib/i18n";
import { str } from "@/lib/act";
import { AppError } from "@/lib/services/common";
import { requestJoin } from "@/lib/services/users";
import { Flash } from "@/components/Flash";
import { LevelsFields, readLevels } from "@/components/LevelsFields";
import { TopicsFields, readTopics } from "@/components/Topics";
import { BackgroundFields, readBackground } from "@/components/BackgroundFields";

async function join(form: FormData) {
  "use server";
  const locale = await getLocale();
  let dest = "/join?ok=joinSent";
  try {
    const r = await requestJoin(prisma, {
      name: str(form.get("name")),
      email: str(form.get("email")),
      phone: str(form.get("phone")),
      instagram: str(form.get("instagram")),
      howHeard: str(form.get("howHeard")),
      levels: readLevels(form),
      topics: readTopics(form),
      ...(() => { const b = readBackground(form); return { skills: b.skills ?? undefined, background: b.background ?? undefined }; })(),
      businessNote: str(form.get("businessNote")),
      locale,
    });
    if (r.status === "APPROVED") dest = "/login?ok=joinAlready";
  } catch (e) {
    if (e instanceof AppError) dest = `/join?err=${e.code}`;
    else throw e;
  }
  redirect(dest);
}

export default async function Join({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (user?.status === "APPROVED") redirect("/app");
  const { t, locale } = await getT(user?.locale);
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <p className="label">Skopjanki</p>
      <h1>{t.joinTitle}</h1>
      <p className="meta">{t.joinIntro}</p>
      <Flash sp={sp} locale={locale} />
      <div className="notice spam-note" role="note"><strong>{t.spamTitle}</strong> {t.spamText}</div>
      {sp.ok ? null : (
        <form action={join} className="card" style={{ marginTop: 16 }}>
          <div className="two">
            <div><label htmlFor="name">{t.name}</label><input id="name" name="name" required autoComplete="name" /></div>
            <div><label htmlFor="email">{t.email}</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
            <div><label htmlFor="phone">{t.phone}</label><input id="phone" name="phone" type="tel" autoComplete="tel" /></div>
            <div><label htmlFor="instagram">{t.instagram}</label><input id="instagram" name="instagram" placeholder="@" /></div>
          </div>
          <label htmlFor="howHeard">{t.howHeard}</label>
          <input id="howHeard" name="howHeard" />
          <LevelsFields locale={locale} />
          <h3 style={{ marginTop: 24 }}>{t.interestsTitle}</h3>
          <TopicsFields locale={locale} />
          <BackgroundFields locale={locale} />
          <label htmlFor="businessNote">{t.businessNoteLabel}</label>
          <textarea id="businessNote" name="businessNote" rows={2} maxLength={300} placeholder={t.businessNotePlaceholder} />
          <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">{t.send}</button></p>
        </form>
      )}
      <p className="meta" style={{ marginTop: 16 }}><a href="/login">{t.signIn}</a></p>
    </div>
  );
}
