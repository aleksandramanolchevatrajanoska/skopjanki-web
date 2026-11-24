import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/** Partner logos are public, like the partner list on the home page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await prisma.partnerLogo.findUnique({ where: { partnerId: id } });
  if (!img) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=86400" },
  });
}
