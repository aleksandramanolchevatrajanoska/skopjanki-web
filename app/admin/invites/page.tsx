import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { str } from "@/lib/act";
import { appUrl } from "@/lib/email";
import { DEFAULT_LETTER, inviteSettings, saveInviteSettings } from "@/lib/services/invites";
import { CopyButton } from "@/components/Interactive";
import { SaveButton } from "@/components/AdminPartnerButtons";

async function save(form: FormData) {
  "use server";
  await requireOwner();
  await saveInviteSettings(prisma, str(form.get("letter")), String(form.get("names") ?? ""));
  revalidatePath("/admin/invites");
}

async function useDefaultLetter() {
  "use server";
  await requireOwner();
  const { names } = await inviteSettings(prisma);
  await saveInviteSettings(prisma, DEFAULT_LETTER, names.join("\n"));
  revalidatePath("/admin/invites");
}

export default async function Invites() {
  const { letter, names } = await inviteSettings(prisma);
  const link = (n: string) => appUrl(`/pokana?za=${encodeURIComponent(n)}`);
  const general = `Здраво! 💛 Те каниме во Скопјанки, клуб за девојки што сакаат да спортуваат, да се дружат и да растат заедно. Тука е поканата и како да се приклучиш: ${appUrl("/pokana")}`;
  const message = (n: string) => `Здраво ${n}! 💛 Ти подготвив лична покана за Скопјанки, клубот што го градам за девојки што сакаат да спортуваат заедно. Погледни ја тука: ${link(n)}`;
  return (
    <>
      <h1>Invitations</h1>
      <p className="meta" style={{ maxWidth: "64ch" }}>
        Write your letter once and list the girls you want to invite. Each girl gets her own card at a personal link, with her name, your letter, the member benefits and a button to join. Copy the link or the whole message and send it on Instagram or Viber.
      </p>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Invitation without a name</h2>
        <p className="meta">The same card, letter, steps and benefits, for anyone. Send it on Viber or Instagram, or post it in a story.</p>
        <p style={{ margin: "8px 0" }}><a href="/pokana" target="_blank" rel="noopener noreferrer">{appUrl("/pokana")} ↗</a></p>
        <div className="row">
          <CopyButton value={general} label="Copy message" done="Copied" />
          <a className="btn sm ghost" href={`viber://forward?text=${encodeURIComponent(general)}`}>Viber</a>
          <CopyButton value={appUrl("/pokana")} label="Copy link" done="Copied" />
        </div>
      </section>

      {letter !== DEFAULT_LETTER && (
        <details className="card" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>A newer letter is ready: see it</summary>
          <p className="meta" style={{ whiteSpace: "pre-line", marginTop: 8 }}>{DEFAULT_LETTER}</p>
          <form action={useDefaultLetter}><button className="btn sm pink" type="submit">Use this letter</button></form>
        </details>
      )}
      <form action={save} className="card stack" style={{ marginTop: 16 }}>
        <label htmlFor="letter">Your letter: why you are building Skopjanki (paragraphs separated by an empty line)</label>
        <textarea id="letter" name="letter" rows={14} maxLength={3000} defaultValue={letter} />

        <label htmlFor="names">Names, one per line</label>
        <textarea id="names" name="names" rows={8} defaultValue={names.join("\n")} placeholder={"Ана\nМарија\nТеона"} />
        <p><SaveButton label="Save" /></p>
      </form>

      {names.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2>{names.length} personal invitations</h2>
          <table>
            <tbody>
              {names.map((n) => (
                <tr key={n}>
                  <td><strong>{n}</strong></td>
                  <td><a href={`/pokana?za=${encodeURIComponent(n)}`} target="_blank" rel="noopener noreferrer">See her card ↗</a></td>
                  <td><CopyButton value={link(n)} label="Copy link" done="Copied" /></td>
                  <td><CopyButton value={message(n)} label="Copy message" done="Copied" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
