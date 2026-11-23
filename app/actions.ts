"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export async function setLanguage(form: FormData) {
  const lang = form.get("lang") === "mk" ? "mk" : "en";
  (await cookies()).set("lang", lang, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  const back = (await headers()).get("referer");
  let path = "/";
  try {
    if (back) path = new URL(back).pathname + new URL(back).search; // same-site path only
  } catch {}
  redirect(path.startsWith("/") ? path : "/");
}
