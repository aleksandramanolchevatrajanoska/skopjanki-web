import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

/** Event posters are promotional, so anyone can see the poster of a published event. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.eventPoster.findFirst({ where: { eventId: id, event: { status: { in: ["APPROVED", "CANCELLED"] } } } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(p.data), {
    headers: { "Content-Type": p.mime, "Cache-Control": "public, max-age=300", ETag: `"${p.updatedAt.getTime()}"` },
  });
}
