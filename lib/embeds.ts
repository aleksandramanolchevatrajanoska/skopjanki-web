/** Turns an Instagram / YouTube / TikTok link into an embeddable player address, or null if it is not one. */
export type Embed = { kind: "instagram" | "youtube" | "tiktok"; url: string; embedUrl: string; portrait: boolean };

export function toEmbed(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "instagram.com") {
    const i = parts.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p));
    const code = i >= 0 ? parts[i + 1] : null;
    if (!code || !/^[\w-]+$/.test(code)) return null;
    const type = parts[i] === "p" ? "p" : "reel";
    return { kind: "instagram", url: `https://www.instagram.com/${type}/${code}/`, embedUrl: `https://www.instagram.com/${type}/${code}/embed`, portrait: true };
  }
  if (host === "youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "shorts" || parts[0] === "embed" ? parts[1] : u.searchParams.get("v");
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, portrait: parts[0] === "shorts" };
  }
  if (host === "tiktok.com") {
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : null;
    if (!id || !/^\d+$/.test(id)) return null;
    return { kind: "tiktok", url: u.origin + u.pathname, embedUrl: `https://www.tiktok.com/embed/v2/${id}`, portrait: true };
  }
  return null;
}

/** Keeps only links we can show, one per line, at most 8. */
export function cleanVideoLinks(lines: string[]) {
  return Array.from(new Set(lines.map((l) => toEmbed(l)?.url).filter((x): x is string => Boolean(x)))).slice(0, 8);
}
