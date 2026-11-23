import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runLifecycle } from "@/lib/services/lifecycle";

export const dynamic = "force-dynamic";

/** Called by Vercel Cron (see vercel.json): locks prices 48h before, reminders, waiting-list expiry. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await runLifecycle(prisma);
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
