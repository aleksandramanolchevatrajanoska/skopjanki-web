import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken, setSessionCookie } from "@/lib/auth";
import { appUrl } from "@/lib/email";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const session = token ? await consumeLoginToken(token) : null;
  if (!session) return NextResponse.redirect(appUrl("/login?bad=1"));
  await setSessionCookie(session);
  return NextResponse.redirect(appUrl("/app"));
}
