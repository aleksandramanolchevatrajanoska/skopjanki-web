import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken, setSessionCookie } from "@/lib/auth";
import { appUrl } from "@/lib/email";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const session = token ? await consumeLoginToken(token) : null;
  if (!session) return NextResponse.redirect(appUrl("/login?bad=1"));
  await setSessionCookie(session);
  // On a phone the link may have opened inside Gmail or Instagram: offer to open it in the real browser too.
  const phone = req.nextUrl.searchParams.get("ext") !== "1" && /iPhone|iPad|Android/i.test(req.headers.get("user-agent") ?? "");
  return NextResponse.redirect(appUrl(phone ? `/auth/ok?token=${encodeURIComponent(token)}` : "/"));
}
