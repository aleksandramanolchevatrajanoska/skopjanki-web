import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { Flash } from "@/components/Flash";
import type { Partner, PartnerApplication } from "@prisma/client";
import { ImageUploader } from "@/components/Interactive";
import { decidePartnerApplication, partnerDealLines } from "@/lib/services/partners";

function fields(form: FormData) {
  return {
    name: str(form.get("name")),
    activity: str(form.get("activity")),
    address: str(form.get("address")) || null,
    mapsUrl: str(form.get("mapsUrl")) || null,
    instagram: str(form.get("instagram")).replace(/^@/, "") || null,
    website: str(form.get("website")) || null,
    contact: str(form.get("contact")) || null,
    email: str(form.get("email")) || null,
    phone: str(form.get("phone")) || null,
    notes: str(form.get("notes")) || null,
    offer: str(form.get("offer")) || null,
    code: str(form.get("code")) || null,
    active: form.get("active") !== "0",
  };
}

async function save(form: FormData) {
  "use server";
  await requireOwner();
  const id = str(form.get("id"));
  await attempt("/admin/partners", async () => {
    const data = fields(form);
    if (!data.name) throw new (await import("@/lib/services/common")).AppError("BAD_INPUT");
    if (id) await prisma.partner.update({ where: { id }, data });
    else await prisma.partner.create({ data });
  });
}

async function decideApp(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/partners", () => decidePartnerApplication(prisma, String(form.get("id")), form.get("accept") === "1"));
}

const OFFER_LABEL: Record<string, string> = { discount_session: "discount on terms", discount_gear: "discount on gear", free_trial: "free trial / vouchers", space: "space for activities", gifts: "gifts / products", other: "other" };

function Application({ a }: { a: PartnerApplication }) {
  return (
    <div className="card stack">
      <div className="between">
        <div><h3>{a.business}</h3><p className="meta">{a.kind}{a.address ? ` · ${a.address}` : ""} · {a.createdAt.toLocaleDateString("en-GB")}</p></div>
        {a.status === "NEW" ? (
          <div className="row">
            <form action={decideApp}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="accept" value="1" /><button className="btn sm pink">Accept as partner</button></form>
            <form action={decideApp}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="accept" value="0" /><button className="btn sm ghost">Decline</button></form>
          </div>
        ) : <span className="tag">{a.status.toLowerCase()}</span>}
      </div>
      <p>{a.person} · {a.phone} · {a.email}{a.instagram ? ` · @${a.instagram}` : ""}{a.website ? <> · <a href={a.website}>link</a></> : null}</p>
      {partnerDealLines(a).length > 0 && (
        <ul className="meta" style={{ margin: 0, paddingLeft: 18 }}>
          {partnerDealLines(a).map((l) => <li key={l}>{l}</li>)}
          {a.captainFree && <li>Captain free: {a.captainFree}</li>}
        </ul>
      )}
      <div className="row">
        {a.offers.map((o) => <span key={o} className="tag p">{OFFER_LABEL[o] ?? o}{o === "discount_session" && a.discountPct ? ` ${a.discountPct}%` : ""}{o === "discount_gear" && a.gearPct ? ` ${a.gearPct}%` : ""}</span>)}
        {a.hostWeekly && <span className="tag c">regular terms</span>}
        {a.hostFusion && <span className="tag c">fusion host</span>}
      </div>
      {a.capacity ? <p className="meta">Capacity for an event: {a.capacity} people</p> : null}
      {a.message && <p style={{ whiteSpace: "pre-line" }}>{a.message}</p>}
    </div>
  );
}

function PartnerForm({ p }: { p?: Partner & { logo?: { updatedAt: Date } | null } }) {
  return (
    <div className="card">
    {p && (
      <div className="row" style={{ marginBottom: 12, alignItems: "center" }}>
        <span className="partner-logo">
          {p.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/partner-logos/${p.id}?v=${p.logo.updatedAt.getTime()}`} alt={`${p.name} logo`} />
          ) : (
            <span aria-hidden="true">{p.name.slice(0, 1)}</span>
          )}
        </span>
        <ImageUploader endpoint="/api/admin/partner-logo" fields={{ partnerId: p.id }} label={p.logo ? "Change logo" : "Upload logo"} uploading="Uploading…" failed="Upload failed" png />
      </div>
    )}
    <form action={save}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="two">
        <div><label>Name</label><input name="name" required defaultValue={p?.name} /></div>
        <div><label>Activity</label><input name="activity" defaultValue={p?.activity} placeholder="Tennis & padel" /></div>
        <div><label>Email for the lists of girls</label><input name="email" type="email" defaultValue={p?.email ?? ""} /></div>
        <div><label>Phone</label><input name="phone" defaultValue={p?.phone ?? ""} /></div>
        <div><label>Address</label><input name="address" defaultValue={p?.address ?? ""} /></div>
        <div><label>Google Maps link</label><input name="mapsUrl" defaultValue={p?.mapsUrl ?? ""} /></div>
        <div><label>Instagram</label><input name="instagram" defaultValue={p?.instagram ?? ""} placeholder="pointer.tennis" /></div>
        <div><label>Website (clicking the partner opens it; else Instagram)</label><input name="website" defaultValue={p?.website ?? ""} placeholder="https://…" /></div>
        <div><label>Contact shown on the site (phone or email)</label><input name="contact" defaultValue={p?.contact ?? ""} placeholder="070 123 456" /></div>
        <div><label>What members get (shown on the site)</label><input name="offer" defaultValue={p?.offer ?? ""} placeholder="15% off court rental" /></div>
        <div><label>Discount code (members only)</label><input name="code" defaultValue={p?.code ?? ""} placeholder="SKOPJANKI15" /></div>
        <div><label>Shown on the site</label><select name="active" defaultValue={p?.active === false ? "0" : "1"}><option value="1">Yes</option><option value="0">No</option></select></div>
      </div>
      <label>Internal notes, organiser only (deal, prices, min/max)</label><textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} />
      <p style={{ marginTop: 12 }}><button className="btn sm" type="submit">{p ? "Save" : "Add partner"}</button></p>
    </form>
    </div>
  );
}

export default async function Partners({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [partners, apps] = await Promise.all([
    prisma.partner.findMany({ orderBy: { name: "asc" }, include: { logo: { select: { updatedAt: true } } } }),
    prisma.partnerApplication.findMany({ orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 50 }),
  ]);
  return (
    <>
      <h1>Partners</h1>
      <Flash sp={sp} locale="en" />
      <p className="meta">Share this link with places you'd like to work with: <strong>/partneri</strong> (anyone can fill it in, no account needed).</p>
      <section className="stack" style={{ marginTop: 16 }}>
        <h2>Applications ({apps.filter((a) => a.status === "NEW").length} new)</h2>
        {apps.length === 0 && <p className="meta">No applications yet.</p>}
        {apps.map((a) => <Application key={a.id} a={a} />)}
      </section>
      <h2 style={{ marginTop: 28 }}>Partners</h2>
      <div className="stack" style={{ marginTop: 16 }}>
        {partners.map((p) => <PartnerForm key={p.id} p={p} />)}
        <h2>New partner</h2>
        <PartnerForm />
      </div>
    </>
  );
}
