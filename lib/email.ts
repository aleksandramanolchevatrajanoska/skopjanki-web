import { prisma } from "./db";

export type Mail = { to: string | string[]; subject: string; text: string; html?: string };

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise logs (development / tests).
 * Every message is also stored in EmailLog so the owner can see what went out.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (to.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  let sent = false;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Skopjanki <hello@skopjanki.mk>",
          to,
          subject: mail.subject,
          text: mail.text,
          ...(mail.html ? { html: mail.html } : {}),
        }),
      });
      sent = res.ok;
      if (!res.ok) console.error("Email failed", res.status, await res.text());
    } catch (e) {
      console.error("Email failed", e);
    }
  }
  // Without a key, or when sending failed, print the message to the server logs (Vercel → Logs)
  // so the organiser can still find a sign-in link.
  if (!sent && process.env.NODE_ENV !== "test") {
    console.log(`\n[email${key ? " NOT SENT" : ""}] to=${to.join(",")}\nsubject: ${mail.subject}\n${mail.text}\n`);
  }
  await prisma.emailLog.create({ data: { to: to.join(","), subject: mail.subject, body: mail.text, sent } });
}

export function appUrl(path = "") {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}
