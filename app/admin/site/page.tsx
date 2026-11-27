import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, int } from "@/lib/act";
import { clubMovement, saveStatsBase, statsBase } from "@/lib/services/points";
import { Flash } from "@/components/Flash";
import { ImageUploader } from "@/components/Interactive";
import { addExampleEvents, removeExampleEvents } from "@/lib/services/examples";

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

async function saveBase(form: FormData) {
  "use server";
  await requireOwner();
  await attempt("/admin/site", () =>
    saveStatsBase(prisma, {
      playHours: int(form.get("playHours")), socialHours: int(form.get("socialHours")),
      km: int(form.get("km")), eventsHeld: int(form.get("eventsHeld")),
    }),
  );
}

export default async function SiteAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const team = await prisma.siteImage.findUnique({ where: { key: "team" }, select: { updatedAt: true } });
  const examples = await prisma.event.count({ where: { example: true } });
  const [base, shown] = await Promise.all([statsBase(prisma), clubMovement(prisma)]);
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
        <h2>Numbers on the home page</h2>
        <p className="meta">The site counts hours and km from the events girls came to (hours = how long each event lasts, not multiplied by the girls: a sport event 1.5 h unless you enter its duration; a fusion event counts 3 h of friendship and its first 1.5 h as play; km = girls × hours of play × 3 km). Add here what happened before the site, e.g. events you ran over Instagram. These are added on top.</p>
        <p className="meta">Shown now: {shown.playHours} h played · {shown.socialHours} h of friendship · {shown.km} km · {shown.eventsHeld} events held.</p>
        <form action={saveBase}>
          <div className="two">
            <div><label htmlFor="playHours">Hours played before the site</label><input id="playHours" name="playHours" type="number" min={0} defaultValue={base.playHours} /></div>
            <div><label htmlFor="socialHours">Hours of friendship before the site</label><input id="socialHours" name="socialHours" type="number" min={0} defaultValue={base.socialHours} /></div>
            <div><label htmlFor="km">Km before the site</label><input id="km" name="km" type="number" min={0} defaultValue={base.km} /></div>
            <div><label htmlFor="eventsHeld">Events held before the site</label><input id="eventsHeld" name="eventsHeld" type="number" min={0} defaultValue={base.eventsHeld} /></div>
          </div>
          <p style={{ marginTop: 12 }}><button className="btn sm" type="submit">Save</button></p>
        </form>
      </section>
      <section className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h2>Core team photo</h2>
        <p className="meta">Shown on the back of the &ldquo;See you at the next one.&rdquo; card on the home page. Until there is a photo, the back of the card says the photo is coming soon. Any photo from your phone works; it is made smaller before upload. An upright (portrait) photo fits best.</p>
        {team && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/site-images/team?v=${team.updatedAt.getTime()}`} alt="Core team" style={{ maxWidth: 220, borderRadius: 4, margin: "12px 0", display: "block" }} />
        )}
        <div style={{ marginTop: 12 }}>
          <ImageUploader endpoint="/api/admin/site-image" fields={{ key: "team" }} label={team ? "Replace photo" : "Upload photo"} uploading="Uploading…" failed="Upload failed. Try a JPG or PNG photo." />
        </div>
        {team && <form action={remove} style={{ marginTop: 10 }}><button className="btn sm ghost" type="submit">Remove photo</button></form>}
      </section>
    </>
  );
}
