import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/** Public site images, e.g. the core team photo on the home page card. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const img = await prisma.siteImage.findUnique({ where: { key } });
  if (!img) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=300" },
  });
}
