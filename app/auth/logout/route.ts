import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
import { appUrl } from "@/lib/email";

export async function POST() {
  await signOut();
  return NextResponse.redirect(appUrl("/"), { status: 303 });
}
