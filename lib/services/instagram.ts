import type { EventKind } from "@prisma/client";
import { weekKey } from "../time";
import { AppError, type Db } from "./common";
import { POSTER_MAX_BYTES, PHOTO_TYPES, setPoster } from "./club";

/**
 * Instagram import through the official Instagram API (Instagram Login). The organiser pastes an access
 * token for @skopjankii once; the site then lists her posts and copies the photos she picks.
 */
const API = "https://graph.instagram.com";
const FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}";
const REFRESH_AFTER_DAYS = 30;

type Res = { ok: boolean; status: number; json(): Promise<unknown>; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> };
export type Fetcher = (url: string) => Promise<Res>;
const defaultFetch: Fetcher = (url) => fetch(url) as unknown as Promise<Res>;

type Media = {
  id: string; caption?: string; media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; media_url?: string; thumbnail_url?: string;
  permalink?: string; timestamp?: string; children?: { data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }[] };
};
export type Post = { id: string; caption: string; timestamp: string; permalink: string | null; images: { id: string; url: string }[] };

function imagesOf(m: Media): { id: string; url: string }[] {
  const pick = (id: string, type: string, url?: string, thumb?: string) => {
    const u = type === "VIDEO" ? thumb : url;
    return u ? [{ id, url: u }] : [];
  };
  if (m.media_type === "CAROUSEL_ALBUM" && m.children?.data?.length) return m.children.data.flatMap((c) => pick(c.id, c.media_type, c.media_url, c.thumbnail_url));
  return pick(m.id, m.media_type, m.media_url, m.thumbnail_url);
}

const toPost = (m: Media): Post => ({ id: m.id, caption: m.caption ?? "", timestamp: m.timestamp ?? new Date().toISOString(), permalink: m.permalink ?? null, images: imagesOf(m) });

async function apiJson(fetcher: Fetcher, url: string) {
  const res = await fetcher(url);
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok || body.error) throw new AppError(body.error?.message?.includes("token") || res.status === 190 || res.status === 401 ? "INSTAGRAM_TOKEN" : "INSTAGRAM_API");
  return body;
}

export async function instagramStatus(db: Db) {
  const [token, user] = await Promise.all([
    db.setting.findUnique({ where: { key: "instagram_token" } }),
    db.setting.findUnique({ where: { key: "instagram_username" } }),
  ]);
  return { connected: Boolean(token), username: user?.value ?? null, savedAt: token?.updatedAt ?? null };
}

/** Checks the token with Instagram and saves it. */
export async function saveInstagramToken(db: Db, raw: string, fetcher: Fetcher = defaultFetch) {
  const token = raw.trim();
  if (token.length < 20) throw new AppError("INSTAGRAM_TOKEN");
  const me = (await apiJson(fetcher, `${API}/me?fields=id,username&access_token=${encodeURIComponent(token)}`)) as { username?: string };
  await db.setting.upsert({ where: { key: "instagram_token" }, create: { key: "instagram_token", value: token }, update: { value: token } });
  await db.setting.upsert({ where: { key: "instagram_username" }, create: { key: "instagram_username", value: me.username ?? "" }, update: { value: me.username ?? "" } });
  return me.username ?? "";
}

export async function disconnectInstagram(db: Db) {
  await db.setting.deleteMany({ where: { key: { in: ["instagram_token", "instagram_username"] } } });
}

/** Long-lived tokens last 60 days; refresh after 30 so the connection never expires while in use. */
async function token(db: Db, fetcher: Fetcher, now = new Date()) {
  const row = await db.setting.findUnique({ where: { key: "instagram_token" } });
  if (!row) throw new AppError("INSTAGRAM_NOT_CONNECTED");
  if (now.getTime() - row.updatedAt.getTime() > REFRESH_AFTER_DAYS * 86400_000) {
    try {
      const r = (await apiJson(fetcher, `${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(row.value)}`)) as { access_token?: string };
      if (r.access_token) {
        await db.setting.update({ where: { key: "instagram_token" }, data: { value: r.access_token } });
        return r.access_token;
      }
    } catch {
      /* keep the old one; it may still work */
    }
  }
  return row.value;
}

export async function listInstagramPosts(db: Db, after: string | null, fetcher: Fetcher = defaultFetch) {
  const tk = await token(db, fetcher);
  const url = `${API}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=24${after ? `&after=${encodeURIComponent(after)}` : ""}&access_token=${encodeURIComponent(tk)}`;
  const body = (await apiJson(fetcher, url)) as { data?: Media[]; paging?: { cursors?: { after?: string }; next?: string } };
  const imported = new Set(
    (await db.photo.findMany({ where: { sourceId: { in: (body.data ?? []).flatMap((m) => imagesOf(m).map((i) => i.id)) } }, select: { sourceId: true } })).map((p) => p.sourceId),
  );
  return {
    posts: (body.data ?? []).map(toPost).map((p) => ({ ...p, imported: p.images.length > 0 && p.images.every((i) => imported.has(i.id)) })),
    after: body.paging?.next ? body.paging.cursors?.after ?? null : null,
  };
}

export type Pick = { mediaId: string; target: string; kind: EventKind }; // target = event id, or "new"
export type InstagramResult = { mediaId: string; status: "imported" | "skipped" | "failed"; photos: number; title?: string; reason?: string };

const titleFrom = (caption: string, when: string) => {
  const line = caption.split("\n").map((l) => l.replace(/#[\p{L}\p{N}_]+/gu, "").trim()).find((l) => l.length > 2);
  return (line ?? `Instagram · ${when.slice(0, 10)}`).slice(0, 120);
};

export async function importInstagramPosts(db: Db, ownerId: string, picks: Pick[], fetcher: Fetcher = defaultFetch): Promise<InstagramResult[]> {
  const tk = await token(db, fetcher);
  const out: InstagramResult[] = [];
  for (const p of picks.slice(0, 30)) {
    try {
      const m = (await apiJson(fetcher, `${API}/${encodeURIComponent(p.mediaId)}?fields=${encodeURIComponent(FIELDS)}&access_token=${encodeURIComponent(tk)}`)) as Media;
      const post = toPost(m);
      let eventId = p.target;
      let title: string | undefined;
      if (p.target === "new") {
        const existing = post.permalink ? await db.event.findUnique({ where: { sourceUrl: post.permalink } }) : null;
        if (existing) eventId = existing.id;
        else {
          const startsAt = new Date(post.timestamp);
          title = titleFrom(post.caption, post.timestamp);
          const e = await db.event.create({
            data: {
              kind: p.kind, status: "APPROVED", title, description: post.caption.slice(0, 2000) || null, startsAt, weekKey: weekKey(startsAt),
              minSpots: 1, maxSpots: 20, pricingMode: "PER_PERSON", priceNonMember: null, publishedAt: new Date(), createdById: ownerId, sourceUrl: post.permalink,
            },
          });
          eventId = e.id;
        }
      } else if (!(await db.event.findUnique({ where: { id: eventId } }))) {
        throw new AppError("EVENT_NOT_FOUND");
      }
      let saved = 0;
      for (const img of post.images) {
        if (await db.photo.findUnique({ where: { sourceId: img.id } })) continue;
        const res = await fetcher(img.url);
        const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        const data = Buffer.from(await res.arrayBuffer());
        if (!res.ok || !PHOTO_TYPES.includes(mime) || data.length === 0 || data.length > POSTER_MAX_BYTES) continue;
        await db.photo.create({ data: { eventId, userId: ownerId, mime, data: new Uint8Array(data), public: true, sourceId: img.id } });
        if (saved === 0 && !(await db.eventPoster.findUnique({ where: { eventId } }))) await setPoster(db, eventId, mime, data);
        saved++;
      }
      out.push({ mediaId: p.mediaId, status: saved ? "imported" : "skipped", photos: saved, title });
    } catch (e) {
      out.push({ mediaId: p.mediaId, status: "failed", photos: 0, reason: e instanceof AppError ? e.code : "Could not import this post" });
    }
  }
  return out;
}
