import { dicts, type Locale } from "@/lib/i18n";
import { isMember, trialEndsAt } from "@/lib/membership";

/** For a girl who is not a member yet: how many days of her free month are left, or that it is over. */
export function TrialBanner({ user, locale }: { user: { approvedAt: Date | null; memberUntil: Date | null; isOwner: boolean }; locale: Locale }) {
  if (isMember(user)) return null;
  const end = trialEndsAt(user);
  if (!end) return null;
  const t = dicts[locale];
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  return (
    <div className={`notice trial${days > 0 ? "" : " over"}`} role="status">
      <span>{days > 0 ? t.trialLeft.replace("{days}", String(days)) : t.trialOver}</span>{" "}
      <a className="btn sm pink" href="/app/membership">{t.becomeMember}</a>
    </div>
  );
}
