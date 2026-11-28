import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { formatDateTime } from "@/lib/time";
import { cancelEvent, updateEvent } from "@/lib/services/events";
import { assignCaptain, removeCaptain } from "@/lib/services/captains";
import { canHaveCaptain } from "@/lib/pricing";
import { isMember } from "@/lib/membership";
import { AppError } from "@/lib/services/common";
import { refund } from "@/lib/stripe";
import { EventFields, readEventForm } from "@/components/EventFields";
import { removePoster } from "@/lib/services/club";
import { ImageUploader } from "@/components/Interactive";
import { posterUrl } from "@/lib/views";
import { Flash } from "@/components/Flash";

async function save(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  const input = readEventForm(form);
  if (isNaN(input.startsAt.getTime())) redirect(`/admin/events/${id}?err=BAD_INPUT`);
  await attempt(`/admin/events/${id}`, () => updateEvent(prisma, id, input));
}

async function cancel(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  let failed = 0;
  try {
    const refunds = await cancelEvent(prisma, id, str(form.get("reason")));
    for (const r of refunds) {
      try {
        await refund(r.paymentIntentId, r.amount);
      } catch (e) {
        failed++;
        console.error("Refund failed", r, e);
      }
    }
  } catch (e) {
    if (e instanceof AppError) redirect(`/admin/events/${id}?err=${e.code}`);
    throw e;
  }
  redirect(`/admin/events/${id}?ok=${failed ? "refundsFailed" : "saved"}`);
}

async function dropPoster(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  await attempt(`/admin/events/${id}`, () => removePoster(prisma, id));
}

async function setCaptain(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  await attempt(`/admin/events/${id}`, () => assignCaptain(prisma, id, String(form.get("userId"))), "captainSet");
}

async function dropCaptain(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  await attempt(`/admin/events/${id}`, () => removeCaptain(prisma, id));
}

export default async function AdminEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const e = await prisma.event.findUnique({
    where: { id },
    include: {
      captain: true,
      reservations: { where: { status: { not: "CANCELLED" } }, include: { user: true }, orderBy: { createdAt: "asc" } },
      debts: { include: { user: true } },
    },
  });
  if (!e) notFound();
  const partners = await prisma.partner.findMany({ orderBy: { name: "asc" } });
  const hasPoster = await prisma.eventPoster.findUnique({ where: { eventId: id }, select: { updatedAt: true } });
  const late = await prisma.reservation.findMany({ where: { eventId: id, lateCancel: true }, include: { user: true } });
  const girls = (await prisma.user.findMany({
    where: { status: "APPROVED" },
    select: { id: true, name: true, isOwner: true, memberUntil: true },
    orderBy: { name: "asc" },
  })).sort((a, b) => Number(isMember(b)) - Number(isMember(a)));
  return (
    <>
      <p><a href="/admin/events" className="meta">← Events</a> · <a href={`/app/events/${id}`} className="meta">Open as the girls see it (and mark attendance)</a></p>
      <h1>{e.title}</h1>
      <p className="meta">{formatDateTime(e.startsAt, "en")} · {e.status.toLowerCase()}{e.lockedAt ? ` · price fixed: ${e.lockedPriceNonMember} / ${e.lockedPriceMember} MKD` : ""}</p>
      <Flash sp={sp} locale="en" />
      {sp.ok === "refundsFailed" && <p className="notice err">Some Stripe refunds failed. Refund them in the Stripe dashboard.</p>}

      <div className="two" style={{ alignItems: "start", marginTop: 16 }}>
        <section className="card">
          <h2>Girls ({e.reservations.filter((r) => r.status === "CONFIRMED").length} / {e.maxSpots})</h2>
          <table>
            <tbody>
              {e.reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.user.name}{r.userId === e.captainId ? " ♛" : ""}<div className="meta">{r.user.phone ?? r.user.email}</div></td>
                  <td>{r.status.toLowerCase().replace("_", " ")}</td>
                  <td>{r.isMember ? "member" : "non-member"}</td>
                  <td>{r.paidAmount ? `${r.paidAmount} MKD paid` : ""}{r.attended === false ? "did not come" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {late.length > 0 && <p className="meta" style={{ marginTop: 8 }}>Late cancellations: {late.map((r) => r.user.name + (r.replacedAt ? " (replaced)" : "")).join(", ")}</p>}
          {e.debts.length > 0 && <p className="meta">Debts: {e.debts.map((d) => `${d.user.name} ${d.amount} MKD ${d.paidAt ? "paid" : d.waivedAt ? "waived" : "open"}`).join(" · ")}</p>}
          {e.captain && (
            <form action={dropCaptain} style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={e.id} />
              <span>Captain: <strong>{e.captain.name}</strong> </span>
              <button className="btn sm ghost" type="submit">Remove captain</button>
            </form>
          )}
          {e.status !== "CANCELLED" && canHaveCaptain(e) && (
            <form action={setCaptain} className="row" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={e.id} />
              <label htmlFor="cap-pick">{e.captain ? "Change captain" : "Make a girl the captain"}</label>
              <select id="cap-pick" name="userId" required defaultValue="" style={{ width: "auto", minWidth: 220 }}>
                <option value="" disabled>Pick a girl…</option>
                {girls.map((g) => <option key={g.id} value={g.id}>{g.name}{isMember(g) ? " ♛" : " (not a member)"}</option>)}
              </select>
              <button className="btn sm" type="submit">Set captain</button>
            </form>
          )}
        </section>

        {e.status !== "CANCELLED" && (
          <section className="card">
            <h2>Cancel event</h2>
            <p className="meta">Everyone gets an email. Nobody owes anything, not even the club to the partner. Fusion payments are refunded in full.</p>
            <form action={cancel}>
              <input type="hidden" name="id" value={e.id} />
              <label htmlFor="reason">Reason</label>
              <input id="reason" name="reason" placeholder="Not enough girls signed up" />
              <p style={{ marginTop: 12 }}><button className="btn sm" type="submit">Cancel event</button></p>
            </form>
          </section>
        )}
      </div>

      {e.status !== "CANCELLED" && (
        <section style={{ marginTop: 28 }}>
          <h2>Edit</h2>
          <div className="card" style={{ maxWidth: 720, marginBottom: 16 }}>
            <h3>Poster</h3>
            <p className="meta">Any photo or Instagram poster works; it is made smaller before upload.</p>
            <ImageUploader endpoint="/api/admin/poster" fields={{ eventId: e.id }} label={hasPoster ? "Replace poster" : "Upload poster"} uploading="Uploading…" failed="Upload failed. Try a JPG or PNG image." />
          </div>
          {hasPoster && (
            <form action={dropPoster} className="row" style={{ margin: "8px 0" }}>
              <input type="hidden" name="id" value={e.id} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterUrl(e.id, hasPoster?.updatedAt)} alt="Poster" style={{ height: 120, borderRadius: 4 }} />
              <button className="btn sm ghost" type="submit">Remove poster</button>
            </form>
          )}
          <form action={save} className="card" style={{ maxWidth: 720 }}>
            <input type="hidden" name="id" value={e.id} />
            <EventFields locale="en" partners={partners} e={e} owner />
            <p className="meta" style={{ marginTop: 8 }}>Saving unlocks the fixed price; it is fixed again automatically 48 hours before.</p>
            <p style={{ marginTop: 12 }}><button className="btn" type="submit">Save</button></p>
          </form>
        </section>
      )}
    </>
  );
}
