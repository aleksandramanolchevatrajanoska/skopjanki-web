import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { appUrl, sendMail } from "./email";
import { isOwnerEmail } from "./membership";

const COOKIE = "sk_session";
const SESSION_DAYS = 60;
const TOKEN_MINUTES = 24 * 60; // one day

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Creates a one-time sign-in link. Returns false when there is no account for the email. */
export async function sendLoginLink(rawEmail: string, locale = "en"): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user && isOwnerEmail(email)) {
    user = await prisma.user.create({
      data: { email, name: "Organiser", status: "APPROVED", isOwner: true, approvedAt: new Date() },
    });
  }
  if (!user) return false;
  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: { tokenHash: sha(token), email, expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000) },
  });
  const link = appUrl(`/auth/verify?token=${token}`);
  await sendMail({
    to: email,
    subject: locale === "mk" ? "Твојот линк за најава во Skopjanki" : "Your Skopjanki sign-in link",
    text:
      locale === "mk"
        ? `Здраво ${user.name},\n\nКликни за да се најавиш (линкот важи 24 часа):\n${link}\n\nSkopjanki`
        : `Hi ${user.name},\n\nClick to sign in (the link works for 24 hours):\n${link}\n\nSkopjanki`,
  });
  return true;
}

/** Consumes a sign-in token and returns the session token to put in the cookie. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const row = await prisma.loginToken.findUnique({ where: { tokenHash: sha(token) } });
  // The link works for its whole day, so it can be opened again in another browser (e.g. after Gmail's in-app browser).
  if (!row || row.expiresAt < new Date()) return null;
  await prisma.loginToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  const user = await prisma.user.findUnique({ where: { email: row.email } });
  if (!user) return null;
  if (isOwnerEmail(user.email) && (!user.isOwner || user.status !== "APPROVED")) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isOwner: true, status: "APPROVED", approvedAt: user.approvedAt ?? new Date() },
    });
  }
  const sessionToken = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { id: sha(sessionToken), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
  });
  return sessionToken;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha(token) } });
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: sha(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** For pages inside the club: signed in AND approved by the organiser. */
export async function requireApproved() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.status !== "APPROVED") redirect("/waiting");
  return user;
}

export async function requireOwner() {
  const user = await requireApproved();
  if (!user.isOwner) redirect("/app");
  return user;
}
