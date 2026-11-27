import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt } from "@/lib/act";
import { formatDateTime } from "@/lib/time";
import { decideUser } from "@/lib/services/users";
import { decideCaptain } from "@/lib/services/captains";
import { decidePlan } from "@/lib/services/events";
import { Flash } from "@/components/Flash";

async function userDecision(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin", () => decideUser(prisma, String(form.get("id")), form.get("approve") === "1"));
}
async function captainDecision(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin", () => decideCaptain(prisma, String(form.get("id")), form.get("approve") === "1"));
}
async function planDecision(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin", () => decidePlan(prisma, String(form.get("id")), form.get("approve") === "1"));
}

function Decide({ action, id }: { action: (f: FormData) => Promise<void>; id: string }) {
  return (
    <div className="row">
      <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="approve" value="1" /><button className="btn sm pink" type="submit">Approve</button></form>
      <form action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="approve" value="0" /><button className="btn sm ghost" type="submit">Reject</button></form>
    </div>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const now = new Date();
  const [girls, captains, plans, lowEvents] = await Promise.all([
    prisma.user.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.captainApplication.findMany({ where: { status: "PENDING", event: { startsAt: { gt: now } } }, include: { user: true, event: true }, orderBy: { createdAt: "asc" } }),
    prisma.event.findMany({ where: { kind: "MEMBER_PLAN", status: "PENDING" }, include: { createdBy: true, partner: true }, orderBy: { startsAt: "asc" } }),
    prisma.event.findMany({ where: { status: "APPROVED", minimumAlertSentAt: { not: null }, startsAt: { gt: now } }, include: { _count: { select: { reservations: { where: { status: "CONFIRMED" } } } } } }),
  ]);
  return (
    <>
      <h1>Approvals</h1>
      <Flash sp={sp} locale="en" />
      {lowEvents.map((e) => (
        <p key={e.id} className="notice err">Minimum not reached: <a href={`/admin/events/${e.id}`}>{e.title}</a> ({e._count.reservations} / min {e.minSpots}). Cancel it or keep it.</p>
      ))}
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Girls who want to join ({girls.length})</h2>
        {girls.length === 0 && <p className="meta">Nobody waiting.</p>}
        {girls.map((g) => (
          <div key={g.id} className="between" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
            <div>
              <strong>{g.name}</strong> <span className="meta">{g.email}{g.phone ? ` · ${g.phone}` : ""}</span>
              {g.instagram && <> · <a href={`https://instagram.com/${g.instagram}`}>@{g.instagram}</a></>}
              <div className="meta">{Object.entries((g.levels ?? {}) as Record<string, string>).map(([s, l]) => `${s}: ${l}`).join(", ") || "–"}{g.howHeard ? ` · heard via: ${g.howHeard}` : ""}</div>
              {(g.topics.length > 0 || g.skills || g.background) && <div className="meta">{[g.background && `Background: ${g.background}`, g.skills && `Skills: ${g.skills}`, g.topics.length > 0 && `Interests: ${g.topics.join(", ")}`].filter(Boolean).join(" · ")}</div>}
              {g.businessNote && <div className="meta">Small business: {g.businessNote}</div>}
            </div>
            <Decide action={userDecision} id={g.id} />
          </div>
        ))}
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Captain requests ({captains.length})</h2>
        {captains.length === 0 && <p className="meta">None.</p>}
        {captains.map((c) => (
          <div key={c.id} className="between" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
            <div><strong>{c.user.name}</strong> for <a href={`/app/events/${c.eventId}`}>{c.event.title}</a> <span className="meta">{formatDateTime(c.event.startsAt, "en")}</span></div>
            <Decide action={captainDecision} id={c.id} />
          </div>
        ))}
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Plans from members ({plans.length})</h2>
        {plans.length === 0 && <p className="meta">None.</p>}
        {plans.map((p) => (
          <div key={p.id} className="between" style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
            <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/posters/${p.id}`} alt="" style={{ width: 72, height: 90, objectFit: "cover", borderRadius: 4, flex: "none" }} />
              <div>
              <strong><a href={`/app/events/${p.id}`}>{p.title}</a></strong> by {p.createdBy.name}
              <div className="meta">{formatDateTime(p.startsAt, "en")} · {p.partner?.name ?? p.place ?? "no place"} · {p.minSpots}–{p.maxSpots} girls · {p.pricingMode === "SPLIT" ? `${p.totalCost} MKD shared` : `${p.priceNonMember} MKD per girl`}</div>
              </div>
            </div>
            <Decide action={planDecision} id={p.id} />
          </div>
        ))}
      </section>
    </>
  );
}
