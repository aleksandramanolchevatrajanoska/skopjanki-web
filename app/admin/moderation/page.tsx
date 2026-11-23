import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { removePhoto } from "@/lib/services/club";
import { formatDateTime } from "@/lib/time";
import { Flash } from "@/components/Flash";

async function togglePublic(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/moderation", () => prisma.photo.update({ where: { id: str(form.get("id")) }, data: { public: form.get("public") === "1" } }));
}
async function deletePhoto(form: FormData) {
  "use server";
  const owner = await requireOwner();
  await attempt("/admin/moderation", () => removePhoto(prisma, owner.id, str(form.get("id"))));
}
async function toggleQuote(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/moderation", () => prisma.quote.update({ where: { userId: str(form.get("id")) }, data: { hidden: form.get("hidden") === "1" } }));
}

export default async function Moderation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [photos, quotes] = await Promise.all([
    prisma.photo.findMany({
      select: { id: true, public: true, createdAt: true, user: { select: { name: true } }, event: { select: { id: true, title: true, startsAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.quote.findMany({ include: { user: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <>
      <h1>Photos and quotes</h1>
      <Flash sp={sp} locale="en" />
      <p className="meta">Photos are visible to girls in the club. Tick “Public” to also show a photo on the public home page (Moments). Ask the girls in it first.</p>
      <div className="photos" style={{ marginTop: 12 }}>
        {photos.map((p) => (
          <figure key={p.id}>
            <a href={`/photos/${p.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/photos/${p.id}`} alt={p.event.title} loading="lazy" />
            </a>
            <figcaption>
              <p className="meta"><a href={`/app/events/${p.event.id}#moments`}>{p.event.title}</a> · {formatDateTime(p.event.startsAt, "en")} · {p.user.name}</p>
              <div className="row">
                <form action={togglePublic}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="public" value={p.public ? "0" : "1"} />
                  <button className={`btn sm ${p.public ? "pink" : "ghost"}`} type="submit">{p.public ? "Public ✓" : "Make public"}</button>
                </form>
                <form action={deletePhoto}><input type="hidden" name="id" value={p.id} /><button className="btn sm ghost" type="submit">Remove</button></form>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
      {photos.length === 0 && <p className="meta">No photos yet.</p>}

      <h2 style={{ marginTop: 32 }}>What the girls say</h2>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Quote</th><th>Girl</th><th></th></tr></thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.userId}>
                <td>“{q.text}”</td>
                <td>{q.user.name}</td>
                <td>
                  <form action={toggleQuote}>
                    <input type="hidden" name="id" value={q.userId} />
                    <input type="hidden" name="hidden" value={q.hidden ? "0" : "1"} />
                    <button className="btn sm ghost" type="submit">{q.hidden ? "Show" : "Hide"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {quotes.length === 0 && <p className="meta">No quotes yet.</p>}
    </>
  );
}
