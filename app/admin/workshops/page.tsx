import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { int } from "@/lib/act";
import { formatDateTime } from "@/lib/time";
import { commissionPct, markCommissionPaid, setCommissionPct, workshopCommission } from "@/lib/services/workshops";
import { SaveButton } from "@/components/AdminPartnerButtons";

async function savePct(form: FormData) {
  "use server";
  await requireOwner();
  await setCommissionPct(prisma, int(form.get("pct")) ?? 0);
  revalidatePath("/admin/workshops");
}

async function paid(form: FormData) {
  "use server";
  await requireOwner();
  await markCommissionPaid(prisma, String(form.get("id")), form.get("paid") === "1");
  revalidatePath("/admin/workshops");
}

export default async function WorkshopsAdmin() {
  const [pct, events] = await Promise.all([
    commissionPct(prisma),
    prisma.event.findMany({ where: { workshop: true }, include: { captain: { select: { name: true } } }, orderBy: { startsAt: "desc" }, take: 60 }),
  ]);
  const rows = await Promise.all(events.map(async (e) => ({ e, m: await workshopCommission(prisma, e.id) })));
  const open = rows.filter((r) => r.m && r.m.final && !r.m.paidAt).reduce((s, r) => s + (r.m?.owed ?? 0), 0);
  return (
    <>
      <h1>Workshops by members</h1>
      <p className="meta" style={{ maxWidth: "64ch" }}>
        Members propose workshops at Propose a plan → “A workshop or session I lead”. The host sets the price and collects it; she owes Skopjanki its share. The share is fixed on each workshop when it is proposed.
      </p>
      <form action={savePct} className="card row" style={{ marginTop: 16, alignItems: "end", gap: 12, maxWidth: 520 }}>
        <div><label htmlFor="pct">Skopjanki share for new workshops (%)</label><input id="pct" name="pct" type="number" min={0} max={100} defaultValue={pct} style={{ width: 120 }} /></div>
        <SaveButton label="Save" />
      </form>
      <p style={{ marginTop: 16 }}>Still to collect (finished workshops): <strong>{open} MKD</strong></p>
      {rows.length === 0 ? (
        <p className="meta">No workshops yet.</p>
      ) : (
        <table style={{ marginTop: 8 }}>
          <tbody>
            {rows.map(({ e, m }) => (
              <tr key={e.id}>
                <td><a href={`/app/events/${e.id}`}>{e.title}</a><br /><span className="meta">{formatDateTime(e.startsAt, "en")} · {e.captain?.name ?? "–"} · {e.status.toLowerCase()}</span></td>
                <td className="meta">{m ? `${m.girls} girls · ${m.collected} MKD` : "–"}</td>
                <td><strong>{m ? `${m.owed} MKD` : "–"}</strong> {m && `(${m.pct}%)`}{m && !m.final && <span className="meta"> estimate</span>}</td>
                <td>
                  {m && m.final && (
                    <form action={paid}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="paid" value={m.paidAt ? "0" : "1"} />
                      <button className={`btn sm ${m.paidAt ? "ghost" : "pink"}`} type="submit">{m.paidAt ? "Paid ✓" : "Mark paid"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
