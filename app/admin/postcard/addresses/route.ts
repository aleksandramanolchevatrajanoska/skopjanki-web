import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addressesCsv, monthKey } from "@/lib/services/club";

/** Organiser only: addresses of active members, for printing the postcards. */
export async function GET() {
  const user = await currentUser();
  if (!user?.isOwner || user.status !== "APPROVED") return new NextResponse("Not found", { status: 404 });
  const csv = await addressesCsv(prisma);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="skopjanki-addresses-${monthKey()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
