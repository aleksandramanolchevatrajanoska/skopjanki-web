import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Posters of published events are promotional, so anyone can see them.
 * A plan still waiting for approval shows its picture only to the organiser and the member who proposed it.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.eventPoster.findUnique({ where: { eventId: id }, include: { event: { select: { status: true, createdById: true } } } });
  if (!p) return new NextResponse("Not found", { status: 404 });
  let cache = "public, max-age=300";
  if (p.event.status === "PENDING") {
    const user = await currentUser();
    if (!user || (!user.isOwner && user.id !== p.event.createdById)) return new NextResponse("Not found", { status: 404 });
    cache = "private, no-store";
  }
  return new NextResponse(new Uint8Array(p.data), {
    headers: { "Content-Type": p.mime, "Cache-Control": cache, ETag: `"${p.updatedAt.getTime()}"` },
  });
}
