import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { createEvent, deleteEvent, deleteUpcomingEvents } from "@/lib/services/events";
import { DeleteButton } from "@/components/AdminPartnerButtons";
import { attempt } from "@/lib/act";
import { importFromLuma } from "@/lib/services/importer";
import { AppError } from "@/lib/services/common";
import { EventFields, readEventForm } from "@/components/EventFields";
import { Flash } from "@/components/Flash";
import { ImageUploader } from "@/components/Interactive";

async function removeOne(form: FormData) {
  "use server";
  await requireOwner();
  const tab = String(form.get("tab") ?? "");
  await attempt(`/admin/events${tab === "past" ? "?tab=past" : ""}`, () => deleteEvent(prisma, String(form.get("id"))), "eventDeleted");
}

async function deleteUpcoming(form: FormData) {
  "use server";
  await requireOwner();
  if (form.get("sure") !== "on") redirect("/admin/events?err=BAD_INPUT#delete");
  const r = await deleteUpcomingEvents(prisma);
  const kept = r.keptPaid.length ? `&kept=${encodeURIComponent(r.keptPaid.join(", "))}` : "";
  redirect(`/admin/events?deleted=${r.deleted}${kept}#delete`);
}

async function create(form: FormData) {
  "use server";
  const owner = await requireOwner();
  const input = readEventForm(form);
  if (isNaN(input.startsAt.getTime())) redirect("/admin/events?err=BAD_INPUT");
  let id: string;
  try {
    id = (await createEvent(prisma, owner.id, input)).id;
  } catch (e) {
    if (e instanceof AppError) redirect(`/admin/events?err=${e.code}`);
    throw e;
  }
  redirect(`/admin/events/${id}?ok=saved`);
}

async function importLuma(form: FormData) {
  "use server";
  const owner = await requireOwner();
  const kind = (["FUSION", "SPECIAL", "WEEKLY"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "FUSION") as "FUSION" | "SPECIAL" | "WEEKLY";
  const urls = String(form.get("urls") ?? "").split(/\s+/);
  const results = await importFromLuma(prisma, owner.id, urls, kind);
  const packed = Buffer.from(JSON.stringify(results.map((r) => [r.status, r.title ?? r.url, r.reason ?? ""]))).toString("base64url");
  redirect(`/admin/events?imp=${packed}#import`);
}

export default async function AdminEvents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  let imported: [string, string, string][] | null = null;
  try {
    imported = sp.imp ? JSON.parse(Buffer.from(sp.imp, "base64url").toString("utf8")) : null;
  } catch {
    imported = null;
  }
  const now = new Date();
  const past = sp.tab === "past";
  const [events, partners, upcomingCount] = await Promise.all([
    prisma.event.findMany({
      where: past ? { startsAt: { lt: now } } : { startsAt: { gte: now } },
      orderBy: { startsAt: past ? "desc" : "asc" },
      include: { partner: true, captain: true, poster: { select: { updatedAt: true } }, _count: { select: { reservations: { where: { status: "CONFIRMED" } } } } },
    }),
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.count({ where: { startsAt: { gte: now } } }),
  ]);
  return (
    <>
      <h1>Events</h1>
      <Flash sp={sp} locale="en" />
      <nav className="row" style={{ marginTop: 12 }} aria-label="Upcoming or past">
        <a className={`btn sm ${past ? "ghost" : ""}`} href="/admin/events">Upcoming ({upcomingCount})</a>
        <a className={`btn sm ${past ? "" : "ghost"}`} href="/admin/events?tab=past">Past</a>
      </nav>
      {events.length === 0 && <p className="meta" style={{ marginTop: 12 }}>{past ? "No past events." : "No upcoming events. Add one below."}</p>}
      <div className="tablewrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Picture</th><th>Girls</th><th>Captain</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{formatDateTime(e.startsAt, "en")}</td>
                <td><a href={`/admin/events/${e.id}`}><strong>{e.title}</strong></a><div className="meta">{e.kind.toLowerCase().replace("_", " ")}{e.partner ? ` · ${e.partner.name}` : ""}</div></td>
                <td>
                  <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    {e.poster || e.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.poster ? `/posters/${e.id}?v=${e.poster.updatedAt.getTime()}` : e.imageUrl!} alt="" className="admin-thumb" />
                    ) : (
                      <span className="admin-thumb empty" aria-hidden="true">–</span>
                    )}
                    <ImageUploader endpoint="/api/admin/poster" fields={{ eventId: e.id }} label={e.poster || e.imageUrl ? "Replace" : "Upload"} uploading="Uploading…" failed="Upload failed" />
                  </div>
                </td>
                <td>{e._count.reservations} / {e.maxSpots} <span className="meta">(min {e.minSpots})</span></td>
                <td>{e.kind === "FUSION" ? "–" : e.captain?.name ?? <span className="meta">none yet</span>}</td>
                <td>{e.status.toLowerCase()}{e.lockedAt ? " · price fixed" : ""}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <a className="btn sm ghost" href={`/admin/events/${e.id}`}>✎ Edit</a>
                    <form action={removeOne}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="tab" value={past ? "past" : ""} />
                      <DeleteButton name={e.title} />
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section id="delete" className="card" style={{ marginTop: 32, maxWidth: 720, borderColor: "var(--warn)" }}>
        <h2>Delete all upcoming events</h2>
        {sp.deleted && <p className="notice ok">Deleted {sp.deleted} upcoming events.</p>}
        {sp.kept && <p className="notice">Kept because a girl already paid online (refund her first, then cancel it): {sp.kept}</p>}
        <p className="meta">Deletes every event that has not started yet: weekly terms, workshops, member plans and fusion events, with their sign-ups, chat and pictures. Past events stay. Events where someone already paid online are kept. This cannot be undone.</p>
        <p>Upcoming now: <strong>{upcomingCount}</strong></p>
        <form action={deleteUpcoming} className="stack">
          <label className="row check" style={{ fontWeight: 400 }}><input type="checkbox" name="sure" required /> I understand: delete all {upcomingCount} upcoming events for good</label>
          <p><button className="btn sm" type="submit" style={{ background: "var(--warn)", borderColor: "var(--warn)" }}>Delete upcoming events</button></p>
        </form>
      </section>
      <section id="import" className="card" style={{ marginTop: 32, maxWidth: 720 }}>
        <h2>Import from Luma</h2>
        <p className="meta">Paste the links of your Luma events, one per line (open each event on luma.com and copy its link, e.g. https://lu.ma/abc123). The site reads the title, date, place, description and cover picture. Past events with a cover also appear in Moments. The same link is never imported twice.</p>
        {imported && (
          <ul className="plans">
            {imported.map(([status, label, reason], i) => (
              <li key={i}><strong>{status === "created" ? "✓ Imported" : status === "exists" ? "Already here" : "✕ Not imported"}</strong>: {label}{reason ? <span className="meta"> ({reason})</span> : null}</li>
            ))}
          </ul>
        )}
        <form action={importLuma}>
          <label htmlFor="urls">Luma links</label>
          <textarea id="urls" name="urls" rows={5} placeholder={"https://lu.ma/...\nhttps://lu.ma/..."} required />
          <label htmlFor="ikind">Import as</label>
          <select id="ikind" name="kind" defaultValue="FUSION" style={{ maxWidth: 260 }}>
            <option value="FUSION">Fusion events</option>
            <option value="SPECIAL">Week 4 specials</option>
            <option value="WEEKLY">Weekly terms</option>
          </select>
          <p style={{ marginTop: 12 }}><button className="btn pink" type="submit">Import</button></p>
        </form>
      </section>

      <h2 style={{ marginTop: 32 }}>New event</h2>
      <p className="meta">After you publish, the event page opens and you can upload its poster there.</p>
      <p className="meta">Weekly terms: venue cost shared (members pay 20% less, captain free) or a fixed price per girl. Fusion: fixed member / non-member price, paid online.</p>
      <form action={create} className="card" style={{ marginTop: 12, maxWidth: 720 }}>
        <EventFields locale="en" partners={partners} owner />
        <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">Publish</button></p>
      </form>
    </>
  );
}
