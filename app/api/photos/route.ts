import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dicts, getLocale } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { addPhoto, PHOTO_MAX_BYTES } from "@/lib/services/club";

/** Upload one photo to a past event (the browser shrinks it first). */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  const t = dicts[await getLocale(user?.locale)];
  if (!user || user.status !== "APPROVED") return NextResponse.json({ message: t.errors.NOT_APPROVED }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > PHOTO_MAX_BYTES + 100_000) return NextResponse.json({ message: t.errors.PHOTO_TOO_BIG }, { status: 413 });
  const form = await req.formData();
  const file = form.get("photo");
  const eventId = String(form.get("eventId") ?? "");
  if (!(file instanceof Blob)) return NextResponse.json({ message: t.errors.BAD_INPUT }, { status: 400 });
  try {
    const p = await addPhoto(prisma, user.id, eventId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ id: p.id });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ message: t.errors[e.code] ?? t.errors.BAD_INPUT }, { status: 400 });
    throw e;
  }
}
