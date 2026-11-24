import { redirect } from "next/navigation";
import { AppError } from "./services/common";

/** Runs a server action and comes back to `path` with ?err=CODE or ?ok=KEY. */
export async function attempt(path: string, fn: () => Promise<unknown>, ok = "saved"): Promise<never> {
  let err: string | null = null;
  try {
    await fn();
  } catch (e) {
    if (e instanceof AppError) err = e.code;
    else throw e;
  }
  // Keep a #section at the very end, after the query.
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}${err ? `err=${err}` : `ok=${ok}`}${hash ? `#${hash}` : ""}`);
}

export const int = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n) : null;
};
export const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
