import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { AppError } from "@/lib/services/common";
import { billingPortal, membershipCheckout } from "@/lib/stripe";
import { Flash } from "@/components/Flash";
import { MemberCard } from "@/components/MemberCard";

async function subscribe() {
  "use server";
  const user = await requireApproved();
  let url: string;
  try {
    url = await membershipCheckout(user);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/membership?err=${e.code}`);
    throw e;
  }
  redirect(url);
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
  return (
    <div className="two" style={{ alignItems: "start" }}>
      <div>
        <h1>{t.membership}</h1>
        <Flash sp={sp} locale={locale} />
        {sp.ok === "memberWelcome" && !member && <div className="notice">{t.payPending}</div>}
        <h2 style={{ marginTop: 16 }}>{t.memberTitle}</h2>
        <ul className="ticks">{t.memberPerks.map((p) => <li key={p}>{p}</li>)}</ul>
        {!member && <form action={subscribe}><button className="btn pink" type="submit">{t.subscribe}</button></form>}
        {member && user.stripeSubscriptionId && <form action={portal}><button className="btn ghost sm" type="submit">{t.manageSub}</button></form>}
      </div>
      <div>{member ? <MemberCard user={user} locale={locale} /> : <p className="notice">{t.notMember}</p>}</div>
    </div>
  );
}
