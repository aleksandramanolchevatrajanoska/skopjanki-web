import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { attempt, str } from "@/lib/act";
import { appUrl } from "@/lib/email";
import { isMember } from "@/lib/membership";
import { monthKey, sendNewsletter } from "@/lib/services/club";
import { AppError } from "@/lib/services/common";
import { Flash } from "@/components/Flash";

const FIELDS = ["headline", "intro", "challengeTitle", "challengeText", "tip", "surprise", "gift"] as const;

function validMonth(m: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : monthKey();
}

async function save(form: FormData) {
  "use server";
  await requireOwner();
  const month = validMonth(str(form.get("month")));
  await attempt(`/admin/postcard?month=${month}`, async () => {
    const data = Object.fromEntries(FIELDS.map((f) => [f, str(form.get(f)).slice(0, 2000) || null])) as Record<(typeof FIELDS)[number], string | null>;
    if (!data.headline) throw new AppError("TITLE_REQUIRED");
    await prisma.newsletter.upsert({ where: { month }, create: { month, ...data, headline: data.headline }, update: { ...data, headline: data.headline } });
  });
}

async function send(form: FormData) {
  "use server";
  await requireOwner();
  const month = validMonth(str(form.get("month")));
  await attempt(`/admin/postcard?month=${month}`, () => sendNewsletter(prisma, month, appUrl), "sent");
}

export default async function AdminPostcard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const month = validMonth(sp.month ?? "");
  const [nl, addresses] = await Promise.all([
    prisma.newsletter.findUnique({ where: { month } }),
    prisma.address.findMany({ include: { user: true } }),
  ]);
  const activeAddresses = addresses.filter((a) => isMember(a.user)).length;
  const label: Record<(typeof FIELDS)[number], string> = {
    headline: "Headline", intro: "Intro", challengeTitle: "Challenge of the month: title", challengeText: "Challenge: text",
    tip: "Tip of the month", surprise: "Surprise (unlocked with 3 stamps)", gift: "Gift in the physical postcard",
  };
  return (
    <>
      <div className="between">
        <h1>Monthly postcard</h1>
        <form className="row"><input type="month" name="month" defaultValue={month} aria-label="Month" style={{ maxWidth: 180 }} /><button className="btn sm ghost">Open</button></form>
      </div>
      <Flash sp={sp} locale="en" />
      {sp.ok === "sent" && <p className="notice ok">Sent to all active members who didn't opt out.</p>}
      <div className="two" style={{ alignItems: "start", marginTop: 12 }}>
        <form action={save} className="card">
          <input type="hidden" name="month" value={month} />
          {FIELDS.map((f) => (
            <div key={f}>
              <label htmlFor={f}>{label[f]}</label>
              {f === "intro" || f === "challengeText" ? (
                <textarea id={f} name={f} rows={3} defaultValue={nl?.[f] ?? ""} />
              ) : (
                <input id={f} name={f} defaultValue={nl?.[f] ?? ""} required={f === "headline"} />
              )}
            </div>
          ))}
          <p style={{ marginTop: 14 }}><button className="btn" type="submit">Save</button></p>
        </form>
        <div className="stack">
          <div className="card">
            <h3>Email</h3>
            <p className="meta">{nl?.sentAt ? `Sent ${nl.sentAt.toLocaleString("en-GB", { timeZone: "Europe/Skopje" })}.` : "Not sent yet."} Members see it any time under Postcard.</p>
            <form action={send}>
              <input type="hidden" name="month" value={month} />
              <button className="btn pink sm" type="submit" disabled={!nl}>{nl?.sentAt ? "Send again" : "Send to members"}</button>
            </form>
          </div>
          <div className="card">
            <h3>Addresses for printing</h3>
            <p className="meta">{activeAddresses} active members gave an address.</p>
            <a className="btn sm" href="/admin/postcard/addresses">Download CSV</a>
            <p className="meta" style={{ marginTop: 8 }}>Opens in Excel, Numbers or Google Sheets, ready for labels.</p>
          </div>
        </div>
      </div>
    </>
  );
}
