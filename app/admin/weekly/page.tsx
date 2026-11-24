import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { DAY, weekKey } from "@/lib/time";
import { composeWeekly, sendWeekly } from "@/lib/services/weekly";
import { Flash } from "@/components/Flash";

async function save(form: FormData) {
  "use server";
  await requireOwner();
  const wk = str(form.get("week"));
  await attempt(`/admin/weekly?week=${wk}`, () =>
    prisma.weeklyLetter.upsert({
      where: { weekKey: wk },
      create: { weekKey: wk, title: str(form.get("title")).slice(0, 120), body: str(form.get("body")).slice(0, 4000), tips: str(form.get("tips")).slice(0, 2000) },
      update: { title: str(form.get("title")).slice(0, 120), body: str(form.get("body")).slice(0, 4000), tips: str(form.get("tips")).slice(0, 2000) },
    }),
  );
}

async function sendNow() {
  "use server";
  await requireOwner();
  await attempt("/admin/weekly", () => sendWeekly(prisma, new Date(), true), "weeklySent");
}

export default async function Weekly({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const now = new Date();
  const thisWeek = weekKey(now);
  const nextWeek = weekKey(new Date(now.getTime() + 7 * DAY));
  const week = sp.week === nextWeek ? nextWeek : thisWeek;
  const [letter, preview, recipients, history] = await Promise.all([
    prisma.weeklyLetter.findUnique({ where: { weekKey: week } }),
    composeWeekly(prisma, "mk", now, sp.as !== "guest"),
    prisma.user.count({ where: { status: "APPROVED", newsletterOptOut: false } }),
    prisma.weeklyLetter.findMany({ where: { sentAt: { not: null } }, orderBy: { weekKey: "desc" }, take: 8 }),
  ]);
  const thisLetter = await prisma.weeklyLetter.findUnique({ where: { weekKey: thisWeek } });
  return (
    <>
      <h1>Weekly letter</h1>
      <p className="meta" style={{ maxWidth: "62ch" }}>
        Every Monday from 8:00 the site emails every approved girl who did not switch it off ({recipients} now). Everyone gets the plans of the next 7 days (added by themselves). Members also get your tips and the thought of the week; the others get a line inviting them to become members.
      </p>
      <Flash sp={sp} locale="en" />
      {sp.ok === "weeklySent" && <p className="notice ok">Sent.</p>}

      <nav className="row" style={{ marginTop: 12 }}>
        <a className={`btn sm ${week === thisWeek ? "" : "ghost"}`} href="/admin/weekly">This week ({thisWeek})</a>
        <a className={`btn sm ${week === nextWeek ? "" : "ghost"}`} href={`/admin/weekly?week=${nextWeek}`}>Next week ({nextWeek})</a>
      </nav>

      <div className="two" style={{ alignItems: "start", marginTop: 16 }}>
        <form action={save} className="card">
          <input type="hidden" name="week" value={week} />
          <h2>This week's letter</h2>
          {letter?.sentAt && <p className="notice">Already sent on {letter.sentAt.toLocaleString("en-GB", { timeZone: "Europe/Skopje" })} to {letter.sentCount} girls.</p>}
          <label htmlFor="title">Title (also the email subject)</label>
          <input id="title" name="title" maxLength={120} defaultValue={letter?.title ?? ""} placeholder="Зошто е во ред да кажеш „не“" />
          <label htmlFor="tips">Tips for the week (one per line, members only)</label>
          <textarea id="tips" name="tips" rows={4} maxLength={2000} defaultValue={letter?.tips ?? ""} placeholder={"Пиј вода пред тенис, не за време.\nНова книга: …\nЗа падел носи патики со добар грип."} />
          <label htmlFor="body">Thought of the week (members only)</label>
          <textarea id="body" name="body" rows={10} maxLength={4000} defaultValue={letter?.body ?? ""} placeholder="Неколку реченици, прашање за размислување, книга, цитат…" />
          <p style={{ marginTop: 12 }}><button className="btn" type="submit">Save</button></p>
        </form>
        <div className="card">
          <h2>Preview (this week, Macedonian)</h2>
          <nav className="row" style={{ margin: "10px 0" }}>
            <a className={`btn sm ${sp.as !== "guest" ? "" : "ghost"}`} href={`/admin/weekly?week=${week}`}>As a member</a>
            <a className={`btn sm ${sp.as === "guest" ? "" : "ghost"}`} href={`/admin/weekly?week=${week}&as=guest`}>As a non-member</a>
          </nav>
          <p className="meta">Subject: <strong>{preview.subject}</strong></p>
          <iframe title="Weekly letter preview" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 720, border: "1px solid var(--line)", borderRadius: 12, background: "#FFF9ED" }} />
          <form action={sendNow} style={{ marginTop: 12 }}>
            <button className="btn pink" type="submit">{thisLetter?.sentAt ? "Send again now" : "Send now"} to {recipients} girls</button>
          </form>
        </div>
      </div>

      {history.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2>Sent</h2>
          <table>
            <tbody>
              {history.map((h) => (
                <tr key={h.weekKey}><td>{h.weekKey}</td><td>{h.title || "(events only)"}</td><td>{h.sentCount} girls</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
