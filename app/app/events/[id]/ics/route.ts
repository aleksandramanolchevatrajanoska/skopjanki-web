import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { icsFile } from "@/lib/calendar";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || user.status !== "APPROVED") return new NextResponse("Not found", { status: 404 });
  const e = await prisma.event.findUnique({ where: { id }, include: { partner: true } });
  if (!e || e.status !== "APPROVED") return new NextResponse("Not found", { status: 404 });
  const place = [e.partner?.name ?? e.place, e.partner?.address].filter(Boolean).join(", ");
  const body = icsFile({ ...e, place }, appUrl(`/app/events/${e.id}`));
  return new NextResponse(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="skopjanki-${e.id}.ics"` },
  });
}
