import { prisma } from "../db";
import { after } from "next/server";
import { runLifecycle } from "./lifecycle";

let last = 0;

/**
 * Vercel's free plan runs cron only once a day, so the same checks (price lock 48h before,
 * waiting-list offers, reminders) also run when someone opens the site, at most every 5 minutes.
 */
export async function maybeRunLifecycle() {
  if (process.env.NODE_ENV === "test") return;
  const now = Date.now();
  if (now - last < 5 * 60_000) return;
  last = now;
  try {
    await runLifecycle(prisma);
  } catch (e) {
    console.error("lifecycle failed", e);
  }
}

/** Runs the checks after the page has been sent, so nobody waits for them. */
export function scheduleLifecycle() {
  if (process.env.NODE_ENV === "test") return;
  try {
    after(() => maybeRunLifecycle());
  } catch {
    void maybeRunLifecycle();
  }
}
