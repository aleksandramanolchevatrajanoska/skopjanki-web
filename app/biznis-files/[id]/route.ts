import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Photos and PDFs of member businesses: for signed-in girls of the club. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.status !== "APPROVED") return new NextResponse("Sign in first", { status: 403 });
  const { id } = await params;
  const f = await prisma.businessFile.findUnique({ where: { id } });
  if (!f) return new NextResponse("Not found", { status: 404 });
  const pdf = f.kind === "PDF";
  return new NextResponse(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      ...(pdf ? { "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}` } : {}),
    },
  });
}
