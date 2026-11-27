import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { setPoster } from "@/lib/services/club";

/** Poster / picture of an event: the organiser only. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  const t = dicts[user?.locale === "mk" ? "mk" : "en"];
  const form = await req.formData();
  const file = form.get("photo");
  const eventId = String(form.get("eventId") ?? "");
  const e = eventId ? await prisma.event.findUnique({ where: { id: eventId } }) : null;
  // Pictures are added by the organiser only, so the database stays small.
  if (!user || !user.isOwner || !e) return NextResponse.json({ message: t.errors.FORBIDDEN }, { status: 403 });
  if (!(file instanceof Blob)) return NextResponse.json({ message: t.errors.BAD_INPUT }, { status: 400 });
  try {
    await setPoster(prisma, eventId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ message: t.errors[err.code] ?? t.errors.BAD_INPUT }, { status: 400 });
    throw err;
  }
}
