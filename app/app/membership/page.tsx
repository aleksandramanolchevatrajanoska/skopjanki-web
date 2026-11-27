import { TrialBanner } from "@/components/TrialBanner";
import { PaysOff } from "@/components/PaysOff";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { isMember, MEMBERSHIP_EUR, MEMBERSHIP_MKD } from "@/lib/membership";
import { AppError } from "@/lib/services/common";
import { billingPortal } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { requestMembership, requestMembershipCancel } from "@/lib/services/users";
import { Flash } from "@/components/Flash";
import { MemberCardWithHint as MemberCard } from "@/components/MemberCard";
import { fmtRange, loadEventCards } from "@/lib/views";
import { formatDateTime } from "@/lib/time";

/** For now the organiser sends each girl a payment link by hand: this tells her someone wants to join. */
async function askToJoin() {
  "use server";
  const user = await requireApproved();
  try {
    await requestMembership(prisma, user.id);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/membership?err=${e.code}`);
    throw e;
  }
  redirect("/app/membership?ok=membershipRequested");
}

async function askToCancel() {
  "use server";
  const user = await requireApproved();
  await requestMembershipCancel(prisma, user.id);
  redirect("/app/membership?ok=cancelRequested");
}

async function portal() {
  "use server";
  const user = await requireApproved();
  let url: string;
  try {
    url = await billingPortal(user);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/membership?err=${e.code}`);
    throw e;
  }
  redirect(url);
}

export default async function Membership({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const upcoming = (await loadEventCards({ status: "APPROVED", startsAt: { gt: new Date() } }, user.id)).filter((e) => e.range);
  const chosen = upcoming.find((e) => e.id === sp.e) ?? upcoming[0];
  return (
    <>
      <h1>{t.compareTitle}</h1>
      <p className="meta" style={{ maxWidth: "60ch" }}>{t.compareIntro}</p>
      <div style={{ maxWidth: 760, marginTop: 16 }}>
        <section className="spots-box">
          <p className="label">{t.trialTitle}</p>
          <p>{t.trialText}</p>
          <p className="label" style={{ marginTop: 14 }}>{t.spotsTitle}</p>
          <p>{t.spotsText}</p>
          <p><strong>♛ {t.priceLockText}</strong></p>
          <PaysOff locale={locale} />
          <p className="label" style={{ marginTop: 14 }}>{t.whyTitle}</p>
          <p>{t.whyText}</p>
        </section>
      </div>
      <Flash sp={sp} locale={locale} />
      <TrialBanner user={user} locale={locale} />
      {sp.ok === "memberWelcome" && !member && <div className="notice">{t.payPending}</div>}
      <div className="grid">
        <div className="card">
          <h3>{t.freeTitle}</h3>
          <p className="price">0 <small className="meta">MKD</small></p>
          <ul className="ticks">{t.freePerks.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
        <div className="card" style={{ border: "2.5px solid var(--pink)" }}>
          <span className="tag p">{t.memberLabel}</span>
          <h3>Skopjanki {t.memberLabel}</h3>
          <p className="price">{MEMBERSHIP_MKD} <small className="meta">MKD ({MEMBERSHIP_EUR} €) / {t.perMonth}</small></p>
          <ul className="ticks"><li>{t.memberEverythingFree}</li>{t.memberPerks.map((p) => <li key={p}>{p}</li>)}</ul>
          {!member && (user.membershipRequestedAt ? (
            <p className="notice ok">{t.membershipRequestedOn.replace("{date}", formatDateTime(user.membershipRequestedAt, locale))}</p>
          ) : (
            <form action={askToJoin}><button className="btn pink" type="submit">{t.requestMembership}</button></form>
          ))}
          {member && <MemberCard user={user} locale={locale} />}
          {member && user.stripeSubscriptionId && <form action={portal} style={{ marginTop: 10 }}><button className="btn ghost sm" type="submit">{t.manageSub}</button></form>}
          {member && !user.isOwner && (user.membershipCancelRequestedAt ? (
            <p className="notice" style={{ marginTop: 10 }}>{t.cancelRequestedOn.replace("{date}", formatDateTime(user.membershipCancelRequestedAt, locale))}</p>
          ) : (
            <details className="cancel-box" style={{ marginTop: 14 }}>
              <summary className="meta">{t.cancelMembership}</summary>
              <p className="meta">{t.cancelMembershipHint}</p>
              <form action={askToCancel}><button className="btn sm ghost" type="submit">{t.cancelMembershipConfirm}</button></form>
            </details>
          ))}
        </div>
      </div>

      {chosen && chosen.range && (
        <section className="card" style={{ marginTop: 20, maxWidth: 640 }}>
          <h3>{t.calcTitle}</h3>
          <p className="meta">{t.calcIntro}</p>
          <form className="row" style={{ marginTop: 10 }}>
            <label htmlFor="e" className="sr-only">{t.calcEvent}</label>
            <select id="e" name="e" defaultValue={chosen.id} style={{ flex: 1, minWidth: 0 }}>
              {upcoming.map((e) => <option key={e.id} value={e.id}>{e.title} · {formatDateTime(e.startsAt, locale)}</option>)}
            </select>
            <button className="btn sm" type="submit">{t.calcShow}</button>
          </form>
          <div className="two" style={{ marginTop: 12 }}>
            <div className="notice">{t.nonMember}<p className="price">{fmtRange(chosen.range.nonMember)} <small>MKD</small></p></div>
            <div className="notice" style={{ background: "var(--pink)", color: "#432344" }}>{t.member}<p className="price" style={{ color: "#432344" }}>{fmtRange(chosen.range.member)} <small>MKD</small></p></div>
          </div>
          <p className="meta">{chosen.kind === "FUSION" ? "Stripe" : t.priceCash}{!chosen.range.fixed ? ` · ${t.priceRange}` : ""}</p>
        </section>
      )}
    </>
  );
}
