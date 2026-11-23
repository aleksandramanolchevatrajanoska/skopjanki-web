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
