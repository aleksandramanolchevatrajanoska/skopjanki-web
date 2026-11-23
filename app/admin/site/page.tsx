import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt } from "@/lib/act";
import { setSiteImage } from "@/lib/services/club";
import { AppError } from "@/lib/services/common";
import { Flash } from "@/components/Flash";
import { addExampleEvents, removeExampleEvents } from "@/lib/services/examples";

async function upload(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/site", async () => {
    const f = form.get("photo");
    if (!(f instanceof Blob) || f.size === 0) throw new AppError("BAD_INPUT");
    await setSiteImage(prisma, "team", f.type, Buffer.from(await f.arrayBuffer()));
  });
}

async function remove() {
  "use server";
  await requireOwner();
  await attempt("/admin/site", () => prisma.siteImage.deleteMany({ where: { key: "team" } }));
}

async function addExamples() {
  "use server";
  const owner = await requireOwner();
  await attempt("/admin/site", () => addExampleEvents(prisma, owner.id));
}

async function clearExamples() {
  "use server";
  await requireOwner();
  await attempt("/admin/site", () => removeExampleEvents(prisma));
}

export default async function SiteAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const team = await prisma.siteImage.findUnique({ where: { key: "team" }, select: { updatedAt: true } });
  const examples = await prisma.event.count({ where: { example: true } });
  return (
    <>
      <h1>Home page</h1>
      <Flash sp={sp} locale="en" />
      <section className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h2>Example events</h2>
        <p className="meta">Adds one example month (padel, aerial, volleyball, a week-4 surprise, and two fusion events: Sip &amp; Serve and Asanas &amp; Mimosas) so you can see how the site looks. Girls can see them too, so remove them before you invite anyone.</p>
        <p className="meta">{examples ? `${examples} example events on the site now.` : "No example events on the site."}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <form action={addExamples}><button className="btn sm pink" type="submit">{examples ? "Add them again" : "Add example events"}</button></form>
          {examples > 0 && <form action={clearExamples}><button className="btn sm ghost" type="submit">Remove all example events</button></form>}
        </div>
      </section>
      <section className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h2>Core team photo</h2>
        <p className="meta">Shown on the back of the &ldquo;See you at the next one.&rdquo; card on the home page. Until there is a photo, the back of the card says the photo is coming soon. JPG, PNG or WebP, max 2.5 MB; an upright (portrait) photo fits best.</p>
        {team && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/site-images/team?v=${team.updatedAt.getTime()}`} alt="Core team" style={{ maxWidth: 220, borderRadius: 4, margin: "12px 0", display: "block" }} />
        )}
        <form action={upload} className="row" style={{ marginTop: 12 }}>
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required style={{ width: "auto" }} />
          <button className="btn sm pink" type="submit">{team ? "Replace photo" : "Upload photo"}</button>
        </form>
        {team && <form action={remove} style={{ marginTop: 10 }}><button className="btn sm ghost" type="submit">Remove photo</button></form>}
      </section>
    </>
  );
}
