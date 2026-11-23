import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { Flash } from "@/components/Flash";
import type { Partner } from "@prisma/client";

function fields(form: FormData) {
  return {
    name: str(form.get("name")),
    activity: str(form.get("activity")),
    address: str(form.get("address")) || null,
    mapsUrl: str(form.get("mapsUrl")) || null,
    instagram: str(form.get("instagram")).replace(/^@/, "") || null,
    email: str(form.get("email")) || null,
    phone: str(form.get("phone")) || null,
    notes: str(form.get("notes")) || null,
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

function PartnerForm({ p }: { p?: Partner }) {
  return (
    <form action={save} className="card">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="two">
        <div><label>Name</label><input name="name" required defaultValue={p?.name} /></div>
        <div><label>Activity</label><input name="activity" defaultValue={p?.activity} placeholder="Tennis & padel" /></div>
        <div><label>Email for the lists of girls</label><input name="email" type="email" defaultValue={p?.email ?? ""} /></div>
        <div><label>Phone</label><input name="phone" defaultValue={p?.phone ?? ""} /></div>
        <div><label>Address</label><input name="address" defaultValue={p?.address ?? ""} /></div>
        <div><label>Google Maps link</label><input name="mapsUrl" defaultValue={p?.mapsUrl ?? ""} /></div>
        <div><label>Instagram</label><input name="instagram" defaultValue={p?.instagram ?? ""} /></div>
        <div><label>Shown on the site</label><select name="active" defaultValue={p?.active === false ? "0" : "1"}><option value="1">Yes</option><option value="0">No</option></select></div>
      </div>
      <label>Notes (deal, prices, min/max)</label><textarea name="notes" rows={2} defaultValue={p?.notes ?? ""} />
      <p style={{ marginTop: 12 }}><button className="btn sm" type="submit">{p ? "Save" : "Add partner"}</button></p>
    </form>
  );
}

export default async function Partners({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const partners = await prisma.partner.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <h1>Partners</h1>
      <Flash sp={sp} locale="en" />
      <div className="stack" style={{ marginTop: 16 }}>
        {partners.map((p) => <PartnerForm key={p.id} p={p} />)}
        <h2>New partner</h2>
        <PartnerForm />
      </div>
    </>
  );
}
