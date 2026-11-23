import type { Metadata } from "next";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { setLanguage } from "./actions";

export const metadata: Metadata = {
  title: "Skopjanki – Active Girls Club",
  description: "Sport and social club for women in Skopje.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const { t, locale } = await getT(user?.locale);
  const inside = user?.status === "APPROVED";
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap"
        />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site">
          <div className="wrap top">
            <a href={inside ? "/app" : "/"} className="logo" aria-label="Skopjanki">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Skopjanki – Active Girls Club" />
            </a>
            <nav className="main" aria-label="Main">
              {inside && <a href="/app">{t.events}</a>}
              {inside && <a href="/app/membership">{t.membership}</a>}
              {inside && <a href="/app/profile">{t.profile}</a>}
              {user?.isOwner && <a href="/admin">{t.admin}</a>}
              <form action={setLanguage}>
                <input type="hidden" name="lang" value={locale === "mk" ? "en" : "mk"} />
                <button type="submit" aria-label={t.language}>{locale === "mk" ? "EN" : "МК"}</button>
              </form>
              {user ? (
                <form action="/auth/logout" method="post"><button type="submit">{t.signOut}</button></form>
              ) : (
                <a href="/login">{t.signIn}</a>
              )}
            </nav>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site">{t.footer} · <a href="https://instagram.com/skopjankii">@skopjankii</a></footer>
      </body>
    </html>
  );
}
