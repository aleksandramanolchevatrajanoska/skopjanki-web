import type { Metadata } from "next";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { Suspense } from "react";
import { setLanguage } from "./actions";
import { NavLinks } from "@/components/NavLinks";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "https://skopjanki.com"),
  title: "Skopjanki – Active Girls Club",
  description: "Спорт, дружба, работилници и кул настани за девојки во Скопје.",
  // The picture Instagram, Viber and WhatsApp show when the link is shared.
  openGraph: {
    type: "website",
    siteName: "Скопјанки",
    title: "Скопјанки · Active Girls Club",
    description: "Спорт, дружба, работилници и кул настани за девојки во Скопје.",
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: "Скопјанки · Active Girls Club" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-default.png"] },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const { t, locale } = await getT(user?.locale);
  const inside = user?.status === "APPROVED";
  return (
    <html lang={locale}>
      <head>
        {/* Always Skopjanki's own colours: no browser or phone dark mode may repaint the site. */}
        <meta name="color-scheme" content="only light" />
        <meta name="darkreader-lock" />
        <meta name="theme-color" content="#FFF9ED" />
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
            <div className="toprow">
              <a href="/" className="logo" aria-label="Skopjanki">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Skopjanki – Active Girls Club" />
              </a>
              <div className="tools">
                <form action={setLanguage}>
                  <input type="hidden" name="lang" value={locale === "mk" ? "en" : "mk"} />
                  <button type="submit" aria-label={t.language}>{locale === "mk" ? "EN" : "МК"}</button>
                </form>
                {user ? (
                  <form action="/auth/logout" method="post"><button type="submit">{t.signOut}</button></form>
                ) : (
                  <a href="/login">{t.signIn}</a>
                )}
              </div>
            </div>
            <nav className="tabs" aria-label="Main">
              <Suspense>
                <NavLinks
                  items={[
                    { href: "/", label: t.home },
                    ...(inside
                      ? [
                          { href: "/app?kind=weekly", label: t.playTab },
                          { href: "/app?kind=fusion", label: t.fusionTab },
                          { href: "/app/community", label: t.community },
                          { href: "/app/partners", label: t.partners },
                          { href: "/app/biznisi", label: t.businessesNav },
                          { href: "/app/membership", label: t.membership },
                          { href: "/app/profile", label: t.profile },
                        ]
                      : [
                          { href: "/join", label: t.join },
                        ]),
                    ...(user?.isOwner ? [{ href: "/admin", label: t.admin }] : []),
                  ]}
                />
              </Suspense>
            </nav>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site">{t.footer} · <a href="https://instagram.com/skopjankii">@skopjankii</a> · <a href="/partneri">{locale === "mk" ? "Стани партнер" : "Become a partner"}</a> · <a href="/privacy">{t.privacy}</a></footer>
      </body>
    </html>
  );
}
