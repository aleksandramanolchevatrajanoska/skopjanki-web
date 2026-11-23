import type { User } from "@prisma/client";
import { dicts, type Locale } from "@/lib/i18n";

export function MemberCard({ user, locale }: { user: User; locale: Locale }) {
  const t = dicts[locale];
  return (
    <div className="membercard" aria-label={t.memberCard}>
      <div className="between">
        <span className="label" style={{ color: "#F2D3E2" }}>{t.memberCard}</span>
        <span style={{ color: "#F49BBC" }}>♛ ♛</span>
      </div>
      <div>
        <div className="n">{user.name}</div>
        <div style={{ color: "#F2D3E2", fontSize: ".85rem" }}>
          {t.memberNo} {user.isOwner ? "001" : String(user.memberNumber ?? "–").padStart(3, "0")}
          {user.memberUntil && ` · ${t.validUntil} ${user.memberUntil.toLocaleDateString(locale === "mk" ? "mk-MK" : "en-GB", { timeZone: "Europe/Skopje" })}`}
        </div>
      </div>
      <div style={{ font: "400 italic 1rem Newsreader, serif", color: "#F49BBC" }}>Skopjanki · Active Girls Club</div>
    </div>
  );
}
