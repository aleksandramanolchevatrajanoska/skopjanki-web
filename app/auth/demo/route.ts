import { randomBytes, createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";

/**
 * Preview only: sign in as the organiser or a demo member without email.
 * Works ONLY when DEMO_LOGIN=1 is set. Never set it on the real site.
 */
export async function GET(req: NextRequest) {
  if (process.env.DEMO_LOGIN !== "1") return new NextResponse("Not found", { status: 404 });
  const as = req.nextUrl.searchParams.get("as") === "owner" ? "owner" : "member";
  const user =
    as === "owner"
      ? await prisma.user.findFirst({ where: { isOwner: true } })
      : await prisma.user.findFirst({ where: { isOwner: false, status: "APPROVED", memberUntil: { gt: new Date() } } });
  if (!user) return new NextResponse("No demo user", { status: 404 });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { id: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 86400_000) },
  });
  await setSessionCookie(token);
  return new NextResponse(null, { status: 303, headers: { Location: as === "owner" ? "/admin" : "/app" } });
}
