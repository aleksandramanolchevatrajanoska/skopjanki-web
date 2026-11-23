import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, int } from "@/lib/act";
import { isMember } from "@/lib/membership";
import { DAY } from "@/lib/time";
import { decideUser, setMembership } from "@/lib/services/users";
import { markDebtPaid } from "@/lib/services/attendance";
import { Flash } from "@/components/Flash";

async function decide(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () => decideUser(prisma, String(form.get("id")), form.get("approve") === "1"));
}

/** Cash membership: add N months from today (or from the current end date). 0 ends it. */
async function membership(form: FormData) {
  "use server";
  await requireOwner();
  const id = String(form.get("id"));
  const months = int(form.get("months")) ?? 0;
  await attempt("/admin/girls", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id } });
    const base = u.memberUntil && u.memberUntil > new Date() ? u.memberUntil : new Date();
    await setMembership(prisma, id, months > 0 ? new Date(base.getTime() + months * 30 * DAY) : null);
  });
}

async function debtPaid(form: FormData) {
  "use server";
  const owner = await requireOwner();
  await attempt("/admin/girls", () => markDebtPaid(prisma, owner.id, String(form.get("id"))));
}

export default async function Girls({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    include: { debts: { where: { paidAt: null, waivedAt: null }, include: { event: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const members = users.filter((u) => isMember(u)).length;
  return (
    <>
      <div className="between">
        <h1>Girls</h1>
        <p className="meta">{users.length} girls · {members} members · {members * 350} MKD / month</p>
      </div>
      <Flash sp={sp} locale="en" />
      <form className="row" style={{ margin: "12px 0" }}><input name="q" defaultValue={q} placeholder="Search name or email" style={{ maxWidth: 320 }} /><button className="btn sm" type="submit">Search</button></form>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Member</th><th>Open debts</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong><div className="meta">{u.email}{u.phone ? ` · ${u.phone}` : ""}{u.instagram ? ` · @${u.instagram}` : ""}</div></td>
                <td>{u.isOwner ? "organiser" : u.status.toLowerCase()}</td>
                <td>
                  {isMember(u) ? `until ${u.memberUntil?.toLocaleDateString("en-GB") ?? "–"}` : "no"}
                  {u.stripeSubscriptionId && <div className="meta">Stripe</div>}
                </td>
                <td>
                  {u.debts.map((d) => (
                    <form key={d.id} action={debtPaid} className="row">
                      <input type="hidden" name="id" value={d.id} />
                      <span>{d.amount} MKD <span className="meta">{d.event.title}</span></span>
                      <button className="btn sm ghost" type="submit">Paid</button>
                    </form>
                  ))}
                </td>
                <td>
                  {u.status === "PENDING" && (
                    <div className="row">
                      <form action={decide}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="approve" value="1" /><button className="btn sm pink">Approve</button></form>
                      <form action={decide}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="approve" value="0" /><button className="btn sm ghost">Reject</button></form>
                    </div>
                  )}
                  {u.status === "APPROVED" && !u.isOwner && (
                    <form action={membership} className="row" title="Membership paid in cash">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="months" defaultValue="1" style={{ width: "auto" }}>
                        <option value="1">+1 month</option><option value="3">+3 months</option><option value="12">+12 months</option><option value="0">End</option>
                      </select>
                      <button className="btn sm ghost" type="submit">Set</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
