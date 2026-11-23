import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Photos the organiser made public are visible to everyone; the rest only to girls in the club. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  if (!photo.public) {
    const user = await currentUser();
    if (!user || user.status !== "APPROVED") return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(Buffer.from(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": photo.public ? "public, max-age=86400" : "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
