import type { User } from "@prisma/client";

export function isMember(u: Pick<User, "isOwner" | "memberUntil"> | null | undefined, now = new Date()) {
  if (!u) return false;
  return u.isOwner || (u.memberUntil != null && u.memberUntil > now);
}

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string) {
  return ownerEmails().includes(email.trim().toLowerCase());
}

/** Monthly membership in MKD, as shown on the site. The amount charged is the Stripe price (STRIPE_MEMBERSHIP_PRICE_ID). */
export const MEMBERSHIP_MKD = 615; // 10 € a month on Stripe
export const MEMBERSHIP_EUR = 10;

/** For now the club opens a limited number of member places. */
export const MEMBER_SPOTS = 30;

/** Fusion events, and any event the organiser marks so, are for members only. */
export function isMembersOnly(e: { kind: string; membersOnly?: boolean | null }) {
  return Boolean(e.membersOnly);
}

/** A newly approved girl can try the club for this long without a membership. */
export const TRIAL_DAYS = 30;

/** When her free trial month ends (null when there is no approval date to count from). */
export function trialEndsAt(u: { approvedAt: Date | null }) {
  return u.approvedAt ? new Date(u.approvedAt.getTime() + TRIAL_DAYS * 86_400_000) : null;
}

/** A non-member may still sign up while her trial month lasts. */
export function inTrial(u: { approvedAt: Date | null }, now = new Date()) {
  const end = trialEndsAt(u);
  return end == null || now < end;
}
