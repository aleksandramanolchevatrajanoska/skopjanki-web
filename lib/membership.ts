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
