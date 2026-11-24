import type { EventKind } from "@prisma/client";
import { weekKey } from "../time";
import { AppError, type Db } from "./common";
import { POSTER_MAX_BYTES, PHOTO_TYPES, setPoster } from "./club";

export type ImportedEvent = {
  title: string;
  startsAt: Date;
  place: string | null;
  description: string | null;
  imageUrl: string | null;
  capacity: number | null;
};

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = re.exec(html);
  return m ? decode(m[1] ?? m[2] ?? "").trim() || null : null;
}

function findEvent(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findEvent(n);
      if (f) return f;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  if (type === "Event" || (Array.isArray(type) && type.includes("Event")) || (typeof type === "string" && type.endsWith("Event"))) return o;
  return findEvent(o["@graph"]);
}

const first = (v: unknown): string | null =>
  typeof v === "string" ? v : Array.isArray(v) ? first(v[0]) : v && typeof v === "object" ? first((v as Record<string, unknown>).url) : null;

function placeOf(loc: unknown): string | null {
  if (!loc) return null;
  if (typeof loc === "string") return loc;
  if (Array.isArray(loc)) return placeOf(loc[0]);
  const o = loc as Record<string, unknown>;
  const addr = o.address;
  const addrText = typeof addr === "string" ? addr : addr && typeof addr === "object"
    ? [(addr as Record<string, string>).streetAddress, (addr as Record<string, string>).addressLocality].filter(Boolean).join(", ")
    : "";
  return [o.name as string | undefined, addrText].filter(Boolean).join(", ") || null;
}

/** Reads a public event page (Luma puts the event in JSON-LD; Open Graph is the fallback). */
export function parseEventPage(html: string): ImportedEvent {
  let ev: Record<string, unknown> | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ev = findEvent(JSON.parse(m[1].trim()));
    } catch {
      /* not JSON */
    }
    if (ev) break;
  }
  const title = (ev?.name as string | undefined)?.trim() || meta(html, "og:title");
  const start = (ev?.startDate as string | undefined) || meta(html, "event:start_time");
  if (!title) throw new AppError("IMPORT_NO_TITLE");
  const startsAt = start ? new Date(start) : null;
  if (!startsAt || isNaN(startsAt.getTime())) throw new AppError("IMPORT_NO_DATE");
  const desc = (ev?.description as string | undefined) || meta(html, "og:description");
  const cap = Number(ev?.maximumAttendeeCapacity);
  return {
    title: decode(title).slice(0, 120),
    startsAt,
    place: placeOf(ev?.location)?.slice(0, 160) ?? null,
    description: desc ? decode(desc).slice(0, 2000) : null,
    imageUrl: first(ev?.image) || meta(html, "og:image"),
    capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
  };
}

export function isLumaUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && ["lu.ma", "luma.com", "www.luma.com"].includes(u.hostname) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string>; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;
const defaultFetch: Fetcher = (url) => fetch(url, { headers: { "User-Agent": "SkopjankiImporter/1.0", Accept: "text/html,image/*" }, redirect: "follow" });

export type ImportResult = { url: string; status: "created" | "exists" | "failed"; title?: string; reason?: string };

/** Imports past (or future) events from public Luma pages. Never imports the same page twice. */
export async function importFromLuma(db: Db, ownerId: string, urls: string[], kind: EventKind, fetcher: Fetcher = defaultFetch): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  const unique = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 30);
  for (const raw of unique) {
    if (!isLumaUrl(raw)) {
      out.push({ url: raw, status: "failed", reason: "Not a Luma link (lu.ma/… or luma.com/…)" });
      continue;
    }
    const url = raw.split("?")[0];
    const existing = await db.event.findUnique({ where: { sourceUrl: url } });
    if (existing) {
      out.push({ url, status: "exists", title: existing.title });
      continue;
    }
    try {
      const res = await fetcher(url);
      if (!res.ok) throw new Error(`Luma answered ${res.status}`);
      const ev = parseEventPage(await res.text());
      const created = await db.event.create({
        data: {
          kind,
          status: "APPROVED",
          title: ev.title,
          description: ev.description,
          place: ev.place,
          startsAt: ev.startsAt,
          weekKey: weekKey(ev.startsAt),
          minSpots: 1,
          maxSpots: ev.capacity ?? 20,
          pricingMode: "PER_PERSON",
          priceNonMember: null,
          publishedAt: new Date(),
          createdById: ownerId,
          sourceUrl: url,
          imageUrl: ev.imageUrl,
        },
      });
      // Copy the cover into the site, and into Moments for past events, when it is small enough.
      if (ev.imageUrl) {
        try {
          const img = await fetcher(ev.imageUrl);
          const mime = (img.headers.get("content-type") ?? "").split(";")[0].trim();
          const data = Buffer.from(await img.arrayBuffer());
          if (img.ok && PHOTO_TYPES.includes(mime) && data.length <= POSTER_MAX_BYTES) {
            await setPoster(db, created.id, mime, data);
            if (ev.startsAt < new Date()) {
              await db.photo.create({ data: { eventId: created.id, userId: ownerId, mime, data: new Uint8Array(data), public: true } });
            }
            await db.event.update({ where: { id: created.id }, data: { imageUrl: null } });
          }
        } catch {
          /* keep the link to the image instead */
        }
      }
      out.push({ url, status: "created", title: ev.title });
    } catch (e) {
      const reason = e instanceof AppError ? (e.code === "IMPORT_NO_DATE" ? "No date found on the page" : "No title found on the page") : e instanceof Error ? e.message : "Could not read the page";
      out.push({ url, status: "failed", reason });
    }
  }
  return out;
}
