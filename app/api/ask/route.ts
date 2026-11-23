import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { askEnabled, askSkopjanki } from "@/lib/ask";
import { dicts, getLocale } from "@/lib/i18n";

const hits = new Map<string, number[]>();
const WINDOW = 10 * 60_000;
const PER_WINDOW = 8;

/** Simple per-visitor limit so the box can't be used to run up the API bill. */
function allowed(key: string, now = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW);
  if (list.length >= PER_WINDOW) return false;
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function POST(req: NextRequest) {
  const t = dicts[await getLocale()];
  if (!askEnabled()) return NextResponse.json({ message: t.askError }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(ip)) return NextResponse.json({ message: t.askError }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim().slice(0, 300);
  if (!question) return NextResponse.json({ message: t.askError }, { status: 400 });
  try {
    const answer = await askSkopjanki(question);
    return NextResponse.json({ answer: answer || t.askError });
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error("ask failed", e.status, e.message);
    else console.error("ask failed", e);
    return NextResponse.json({ message: t.askError }, { status: 502 });
  }
}
