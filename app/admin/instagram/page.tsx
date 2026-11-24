import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { formatDateTime } from "@/lib/time";
import { AppError } from "@/lib/services/common";
import { disconnectInstagram, importInstagramPosts, instagramStatus, listInstagramPosts, saveInstagramToken, type Pick } from "@/lib/services/instagram";
import { Flash } from "@/components/Flash";
import type { EventKind } from "@prisma/client";

async function connect(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/instagram", () => saveInstagramToken(prisma, str(form.get("token"))));
}

async function disconnect() {
  "use server";
  await requireOwner();
  await attempt("/admin/instagram", () => disconnectInstagram(prisma));
}

async function doImport(form: FormData) {
  "use server";
  const owner = await requireOwner();
  const kind = (["FUSION", "SPECIAL", "WEEKLY"].includes(str(form.get("kind"))) ? str(form.get("kind")) : "FUSION") as EventKind;
  const picks: Pick[] = form.getAll("pick").map(String).map((id) => ({ mediaId: id, target: str(form.get(`target_${id}`)) || "new", kind }));
  if (picks.length === 0) redirect("/admin/instagram?err=BAD_INPUT");
  let packed = "";
  try {
    const r = await importInstagramPosts(prisma, owner.id, picks);
    packed = Buffer.from(JSON.stringify(r.map((x) => [x.status, x.title ?? x.mediaId, x.photos, x.reason ?? ""]))).toString("base64url");
  } catch (e) {
    if (e instanceof AppError) redirect(`/admin/instagram?err=${e.code}`);
    throw e;
  }
  redirect(`/admin/instagram?imp=${packed}`);
}

export default async function InstagramAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = await instagramStatus(prisma);
  let results: [string, string, number, string][] | null = null;
  try {
    results = sp.imp ? JSON.parse(Buffer.from(sp.imp, "base64url").toString("utf8")) : null;
  } catch {}

  let list: Awaited<ReturnType<typeof listInstagramPosts>> | null = null;
  let listError: string | null = null;
  if (status.connected) {
    try {
      list = await listInstagramPosts(prisma, sp.after ?? null);
    } catch (e) {
      listError = e instanceof AppError ? e.code : "INSTAGRAM_API";
    }
  }
  const events = status.connected
    ? await prisma.event.findMany({ where: { status: "APPROVED" }, orderBy: { startsAt: "desc" }, take: 60, select: { id: true, title: true, startsAt: true } })
    : [];

  return (
    <>
      <h1>Instagram</h1>
      <p className="meta" style={{ maxWidth: "62ch" }}>Copy photos from @skopjankii posts into the site: into an event you already have, or as a new past event. The photos appear in Moments. A post is never imported twice.</p>
      <Flash sp={sp} locale="en" />
      {listError && <Flash sp={{ err: listError }} locale="en" />}
      {results && (
        <ul className="plans">
          {results.map(([s, label, n, reason], i) => (
            <li key={i}><strong>{s === "imported" ? `✓ ${n} photo${n === 1 ? "" : "s"}` : s === "skipped" ? "Already imported" : "✕ Not imported"}</strong>: {label}{reason ? <span className="meta"> ({reason})</span> : null}</li>
          ))}
        </ul>
      )}

      {!status.connected ? (
        <section className="card" style={{ maxWidth: 720, marginTop: 16 }}>
          <h2>Connect Instagram (once)</h2>
          <ol>
            <li>@skopjankii must be a <strong>professional</strong> account (Creator or Business). In the Instagram app: Settings → Account type and tools → Switch to professional account. It is free.</li>
            <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a>, log in, and <strong>Create app</strong>. Choose the use case for managing content on Instagram.</li>
            <li>In the app, open <strong>Instagram → API setup with Instagram login</strong>, add the @skopjankii account and click <strong>Generate token</strong>.</li>
            <li>Copy the token and paste it here. The site checks it with Instagram and keeps it fresh by itself.</li>
          </ol>
          <form action={connect} style={{ marginTop: 12 }}>
            <label htmlFor="token">Access token</label>
            <input id="token" name="token" required autoComplete="off" />
            <p style={{ marginTop: 12 }}><button className="btn pink" type="submit">Connect</button></p>
          </form>
          <p className="meta">Meta changes these screens from time to time; if a step looks different, the idea is the same: an app with Instagram login and a token for your account.</p>
        </section>
      ) : (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            <span>Connected as <strong>@{status.username}</strong></span>
            <form action={disconnect}><button className="btn sm ghost" type="submit">Disconnect</button></form>
          </div>
          {list && (
            <form action={doImport} style={{ marginTop: 16 }}>
              <div className="row">
                <label htmlFor="kind" style={{ margin: 0 }}>New events are</label>
                <select id="kind" name="kind" defaultValue="FUSION" style={{ width: "auto" }}>
                  <option value="FUSION">Fusion events</option>
                  <option value="SPECIAL">Week 4 specials</option>
                  <option value="WEEKLY">Weekly terms</option>
                </select>
                <button className="btn pink" type="submit">Import selected</button>
              </div>
              <div className="grid">
                {list.posts.map((p) => (
                  <div key={p.id} className="card" style={{ padding: 14, opacity: p.imported ? 0.55 : 1 }}>
                    {p.images[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0].url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }} loading="lazy" />
                    )}
                    <p className="meta">{formatDateTime(new Date(p.timestamp), "en")} · {p.images.length} photo{p.images.length === 1 ? "" : "s"}{p.imported ? " · imported" : ""}</p>
                    <p style={{ fontSize: ".88rem", maxHeight: "4.8em", overflow: "hidden" }}>{p.caption || "–"}</p>
                    <label className="row check" style={{ fontWeight: 600 }}><input type="checkbox" name="pick" value={p.id} disabled={p.imported || p.images.length === 0} /> Import</label>
                    <select name={`target_${p.id}`} defaultValue="new" aria-label="Where to put the photos">
                      <option value="new">As a new past event</option>
                      {events.map((e) => <option key={e.id} value={e.id}>Into: {e.title} ({e.startsAt.toISOString().slice(0, 10)})</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {list.after && <p style={{ marginTop: 16 }}><a className="btn ghost" href={`/admin/instagram?after=${encodeURIComponent(list.after)}`}>Older posts →</a></p>}
            </form>
          )}
        </>
      )}
    </>
  );
}
