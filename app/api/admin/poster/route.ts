import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { setPoster } from "@/lib/services/club";

export async function POST(req: NextRequest) {
  const user = await currentUser();
  const t = dicts.en;
  if (!user?.isOwner) return NextResponse.json({ message: t.errors.FORBIDDEN }, { status: 403 });
  const form = await req.formData();
  const file = form.get("photo");
  const eventId = String(form.get("eventId") ?? "");
  if (!(file instanceof Blob) || !eventId) return NextResponse.json({ message: t.errors.BAD_INPUT }, { status: 400 });
  try {
    await setPoster(prisma, eventId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ message: t.errors[e.code] ?? t.errors.BAD_INPUT }, { status: 400 });
    throw e;
  }
}
