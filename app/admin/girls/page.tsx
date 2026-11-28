import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, int } from "@/lib/act";
import { isMember, MEMBERSHIP_MKD } from "@/lib/membership";
import { DAY } from "@/lib/time";
import { addGirl, adminUpdateProfile, closeCancelRequest, decideUser, setMembership } from "@/lib/services/users";
import { BACKGROUNDS, dicts } from "@/lib/i18n";
import { str } from "@/lib/act";
import { markDebtPaid } from "@/lib/services/attendance";
import { Flash } from "@/components/Flash";
import { CopyButton } from "@/components/Interactive";
import { memberCardLink, sendMemberCard, sendMissingMemberCards } from "@/lib/services/membercard";
import { appUrl } from "@/lib/email";

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

async function add(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () =>
    addGirl(prisma, {
      name: str(form.get("name")), email: str(form.get("email")), phone: str(form.get("phone")), instagram: str(form.get("instagram")),
      months: int(form.get("months")) ?? 0, welcome: form.get("welcome") === "on",
    }), "girlAdded");
}

async function editProfile(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () =>
    adminUpdateProfile(prisma, String(form.get("id")), {
      name: str(form.get("name")), email: str(form.get("email")), phone: str(form.get("phone")), instagram: str(form.get("instagram")),
      bio: str(form.get("bio")), skills: str(form.get("skills")), background: str(form.get("background")),
      showInCommunity: form.get("showInCommunity") === "on",
    }));
}

async function cancelDone(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () => closeCancelRequest(prisma, String(form.get("id")), form.get("endNow") === "1"));
}

async function sendCard(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () => sendMemberCard(prisma, String(form.get("id"))), "cardSent");
}

async function makeLink(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () => memberCardLink(prisma, String(form.get("id"))), "saved");
}

async function sendAllCards() {
  "use server";
  await requireOwner();
  await attempt("/admin/girls", () => sendMissingMemberCards(prisma), "cardsSent");
}

async function debtPaid(form: FormData) {
  "use server";
  const owner = await requireOwner();
  await attempt("/admin/girls", () => markDebtPaid(prisma, owner.id, String(form.get("id"))));
}

/** The message to paste into Viber or Instagram with her card link. */
function cardMessage(name: string, link: string) {
  const first = name.split(/\s+/)[0];
  return `Здраво ${first}! 💛 Добредојде како членка на Скопјанки ♛ Тука е твојата членска картичка и кратко упатство како да го користиш сајтот: ${link}\nЗачувај ја и покажи ја кај партнерите за попуст. Се гледаме на терен!`;
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
  const requests = users.filter((u) => u.membershipRequestedAt && !isMember(u));
  const cancels = users.filter((u) => u.membershipCancelRequestedAt);
  const noCard = users.filter((u) => isMember(u) && !u.isOwner && !u.memberCardSentAt && u.status === "APPROVED");
  return (
    <>
      <div className="between">
        <h1>Girls</h1>
        <p className="meta">{users.length} girls · {members} members · {members * MEMBERSHIP_MKD} MKD / month</p>
      </div>
      <Flash sp={sp} locale="en" />
      <details className="card" style={{ margin: "12px 0" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Add a girl</summary>
        <form action={add} style={{ marginTop: 12 }}>
          <div className="two">
            <div><label htmlFor="ag-name">Name *</label><input id="ag-name" name="name" required maxLength={80} /></div>
            <div><label htmlFor="ag-email">Email *</label><input id="ag-email" name="email" type="email" required /></div>
            <div><label htmlFor="ag-phone">Phone</label><input id="ag-phone" name="phone" /></div>
            <div><label htmlFor="ag-ig">Instagram</label><input id="ag-ig" name="instagram" placeholder="@" /></div>
            <div>
              <label htmlFor="ag-months">Membership</label>
              <select id="ag-months" name="months" defaultValue="0">
                <option value="0">Not a member</option><option value="1">Member, 1 month</option><option value="3">Member, 3 months</option><option value="12">Member, 12 months</option>
              </select>
            </div>
          </div>
          <label className="row check" style={{ fontWeight: 400, marginTop: 10 }}><input type="checkbox" name="welcome" defaultChecked /> Send her a welcome email with the sign-in link</label>
          <p className="meta">She is approved at once. If the email is already on the site, she is approved and the membership is added to hers.</p>
          <p style={{ marginTop: 10 }}><button className="btn sm pink" type="submit">Add</button></p>
        </form>
      </details>
      <section className="card" style={{ margin: "12px 0" }}>
        <h2>Member cards</h2>
        <p className="meta">Each member gets a one-page card with her name, member number and how the site works, at her own secret link. Send it by email, or in her row below use Copy message (paste it into Instagram or Viber) or Viber (opens Viber with the message, on a phone).</p>
        {noCard.length > 0 ? (
          <form action={sendAllCards} style={{ marginTop: 8 }}>
            <button className="btn sm pink" type="submit">Email cards to the {noCard.length} members who haven&apos;t got one</button>
          </form>
        ) : (
          <p className="meta">Every member has had her card.</p>
        )}
      </section>
      {cancels.length > 0 && (
        <section className="card" style={{ margin: "12px 0", borderColor: "var(--warn)" }}>
          <h2>Cancellation requests ({cancels.length})</h2>
          <p className="meta">Cancel each subscription on Stripe (Customers → Subscriptions → Cancel), then mark it here.</p>
          <ul className="desk-list">
            {cancels.map((u) => (
              <li key={u.id}>
                <span>
                  <strong>{u.name}</strong> <span className="meta">· asked {u.membershipCancelRequestedAt!.toLocaleDateString("en-GB")}{u.memberUntil ? ` · member until ${u.memberUntil.toLocaleDateString("en-GB")}` : ""}</span>
                  <br /><span className="meta">{u.email}</span>
                </span>
                <span className="row">
                  <CopyButton value={u.email} label="Copy email" done="Copied" />
                  <form action={cancelDone}><input type="hidden" name="id" value={u.id} /><button className="btn sm" type="submit">Cancelled on Stripe, member until her date</button></form>
                  <form action={cancelDone}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="endNow" value="1" /><button className="btn sm ghost" type="submit">End now</button></form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {requests.length > 0 && (
        <section className="card" style={{ margin: "12px 0", borderColor: "var(--pink)" }}>
          <h2>Membership requests ({requests.length})</h2>
          <p className="meta">Send each one a Stripe payment link. When she has paid, give her membership here.</p>
          <ul className="desk-list">
            {requests.map((u) => (
              <li key={u.id}>
                <span>
                  <strong>{u.name}</strong> <span className="meta">· asked {u.membershipRequestedAt!.toLocaleDateString("en-GB")}</span>
                  <br /><span className="meta">{u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
                </span>
                <span className="row">
                  <CopyButton value={u.email} label="Copy email" done="Copied" />
                  <form action={membership} className="row">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="months" value="1" />
                    <button className="btn sm pink" type="submit">Paid: member for 1 month</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form className="row" style={{ margin: "12px 0" }}><input name="q" defaultValue={q} placeholder="Search name or email" style={{ maxWidth: 320 }} /><button className="btn sm" type="submit">Search</button></form>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Member</th><th>Open debts</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong><div className="meta">{u.email}{u.phone ? ` · ${u.phone}` : ""}{u.instagram ? ` · @${u.instagram}` : ""}</div>
                  <details style={{ marginTop: 6 }}>
                    <summary className="meta" style={{ cursor: "pointer" }}>✎ Edit profile</summary>
                    <form action={editProfile} style={{ marginTop: 8, minWidth: 260 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <label htmlFor={`n-${u.id}`}>Name and surname</label><input id={`n-${u.id}`} name="name" required maxLength={80} defaultValue={u.name} />
                      <label htmlFor={`e-${u.id}`}>Email</label><input id={`e-${u.id}`} name="email" type="email" required defaultValue={u.email} />
                      <label htmlFor={`p-${u.id}`}>Phone</label><input id={`p-${u.id}`} name="phone" defaultValue={u.phone ?? ""} />
                      <label htmlFor={`i-${u.id}`}>Instagram</label><input id={`i-${u.id}`} name="instagram" placeholder="@" defaultValue={u.instagram ?? ""} />
                      <label htmlFor={`b-${u.id}`}>Short bio</label><input id={`b-${u.id}`} name="bio" maxLength={300} defaultValue={u.bio ?? ""} />
                      <label htmlFor={`s-${u.id}`}>Skills</label><input id={`s-${u.id}`} name="skills" maxLength={300} defaultValue={u.skills ?? ""} />
                      <label htmlFor={`bg-${u.id}`}>Background</label>
                      <select id={`bg-${u.id}`} name="background" defaultValue={u.background ?? ""}>
                        <option value="">–</option>
                        {BACKGROUNDS.map((b) => <option key={b} value={b}>{dicts.en.backgroundNames[b] ?? b}</option>)}
                      </select>
                      <label className="row check" style={{ fontWeight: 400, marginTop: 8 }}><input type="checkbox" name="showInCommunity" defaultChecked={u.showInCommunity} /> Show in Community</label>
                      <p style={{ marginTop: 8 }}><button className="btn sm pink" type="submit">Save</button></p>
                    </form>
                  </details>
                </td>
                <td>{u.isOwner ? "organiser" : u.status.toLowerCase()}</td>
                <td>
                  {isMember(u) ? `until ${u.memberUntil?.toLocaleDateString("en-GB") ?? "–"}` : u.membershipRequestedAt ? <span className="tag p">requested</span> : "no"}
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
                  {isMember(u) && !u.isOwner && (
                    <div className="row" style={{ marginBottom: 6 }}>
                      <form action={sendCard}><input type="hidden" name="id" value={u.id} /><button className="btn sm" type="submit">{u.memberCardSentAt ? "Resend card" : "Send member card"}</button></form>
                      {u.memberCardToken ? (
                        <>
                          <CopyButton value={cardMessage(u.name, appUrl(`/karticka/${u.memberCardToken}`))} label="Copy message" done="Copied" />
                          <a className="btn sm ghost" href={`viber://forward?text=${encodeURIComponent(cardMessage(u.name, appUrl(`/karticka/${u.memberCardToken}`)))}`}>Viber</a>
                          <CopyButton value={appUrl(`/karticka/${u.memberCardToken}`)} label="Copy link" done="Copied" />
                          <a className="btn sm ghost" href={`/karticka/${u.memberCardToken}`} target="_blank" rel="noopener noreferrer">See ↗</a>
                        </>
                      ) : (
                        <form action={makeLink}><input type="hidden" name="id" value={u.id} /><button className="btn sm ghost" type="submit">Make card link</button></form>
                      )}
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
