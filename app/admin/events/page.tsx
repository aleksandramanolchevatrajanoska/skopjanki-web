import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { createEvent } from "@/lib/services/events";
import { AppError } from "@/lib/services/common";
import { EventFields, readEventForm } from "@/components/EventFields";
import { Flash } from "@/components/Flash";

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

export default async function AdminEvents({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const now = new Date();
  const [events, partners] = await Promise.all([
    prisma.event.findMany({
      where: { startsAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
      orderBy: { startsAt: "asc" },
      include: { partner: true, captain: true, _count: { select: { reservations: { where: { status: "CONFIRMED" } } } } },
    }),
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <h1>Events</h1>
      <Flash sp={sp} locale="en" />
      <div className="tablewrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Girls</th><th>Captain</th><th>Status</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{formatDateTime(e.startsAt, "en")}</td>
                <td><a href={`/admin/events/${e.id}`}><strong>{e.title}</strong></a><div className="meta">{e.kind.toLowerCase().replace("_", " ")}{e.partner ? ` · ${e.partner.name}` : ""}</div></td>
                <td>{e._count.reservations} / {e.maxSpots} <span className="meta">(min {e.minSpots})</span></td>
                <td>{e.kind === "FUSION" ? "–" : e.captain?.name ?? <span className="meta">none yet</span>}</td>
                <td>{e.status.toLowerCase()}{e.lockedAt ? " · price fixed" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ marginTop: 32 }}>New event</h2>
      <p className="meta">Weekly terms: venue cost shared (members pay 20% less, captain free) or a fixed price per girl. Fusion: fixed member / non-member price, paid online.</p>
      <form action={create} className="card" style={{ marginTop: 12, maxWidth: 720 }}>
        <EventFields locale="en" partners={partners} owner />
        <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">Publish</button></p>
      </form>
    </>
  );
}
