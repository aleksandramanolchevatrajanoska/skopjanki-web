import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { addBusinessFile } from "@/lib/services/businesses";

/** A member adds a photo or a PDF to her business page (the organiser can too). */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  const t = dicts[user?.locale === "en" ? "en" : "mk"];
  if (!user || user.status !== "APPROVED") return NextResponse.json({ message: t.errors.FORBIDDEN }, { status: 403 });
  const form = await req.formData();
  const file = form.get("photo") ?? form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: t.errors.BAD_INPUT }, { status: 400 });
  try {
    await addBusinessFile(prisma, user.id, String(form.get("businessId") ?? ""), {
      name: file.name, mime: file.type, data: Buffer.from(await file.arrayBuffer()), slot: String(form.get("slot") ?? ""),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ message: t.errors[err.code] ?? t.errors.BAD_INPUT }, { status: 400 });
    throw err;
  }
}
