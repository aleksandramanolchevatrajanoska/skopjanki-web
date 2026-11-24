import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dicts } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { setPartnerLogo } from "@/lib/services/club";

/** The organiser uploads a partner's logo. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  const t = dicts[user?.locale === "mk" ? "mk" : "en"];
  if (!user?.isOwner) return NextResponse.json({ message: t.errors.FORBIDDEN }, { status: 403 });
  const form = await req.formData();
  const file = form.get("photo");
  const partnerId = String(form.get("partnerId") ?? "");
  if (!(file instanceof Blob) || !(await prisma.partner.findUnique({ where: { id: partnerId } }))) {
    return NextResponse.json({ message: t.errors.BAD_INPUT }, { status: 400 });
  }
  try {
    await setPartnerLogo(prisma, partnerId, file.type, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ message: t.errors[err.code] ?? t.errors.BAD_INPUT }, { status: 400 });
    throw err;
  }
}
