import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { attempt, str } from "@/lib/act";
import { loadEventCards } from "@/lib/views";
import { openDebts } from "@/lib/services/attendance";
import { myPoints } from "@/lib/services/points";
import { EventCardView } from "@/components/EventCardView";
import { Flash } from "@/components/Flash";
import { LevelsFields, readLevels } from "@/components/LevelsFields";
import { TopicsFields, readTopics } from "@/components/Topics";
import { MemberCardWithHint as MemberCard } from "@/components/MemberCard";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { AppError } from "@/lib/services/common";
import { deleteAccount, saveQuote, QUOTE_MAX } from "@/lib/services/club";

async function doSaveQuote(form: FormData) {
  "use server";
  const user = await requireApproved();
  await attempt("/app/profile#quote", () => saveQuote(prisma, user.id, str(form.get("quote"))));
}

async function doDelete(form: FormData) {
  "use server";
  const user = await requireApproved();
  if (str(form.get("confirm")) !== "DELETE") redirect("/app/profile?err=CONFIRM_DELETE#delete");
  try {
    await deleteAccount(prisma, user.id);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/profile?err=${e.code}#delete`);
    throw e;
  }
  await signOut();
  redirect("/?ok=deleted");
}

async function saveProfile(form: FormData) {
  "use server";
  const user = await requireApproved();
  await attempt("/app/profile", async () => {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: str(form.get("name")) || user.name,
        phone: str(form.get("phone")) || null,
        instagram: str(form.get("instagram")).replace(/^@/, "") || null,
        bio: str(form.get("bio")).slice(0, 280) || null,
        about: str(form.get("about")).slice(0, 800) || null,
        topics: readTopics(form),
        levels: readLevels(form),
        locale: form.get("locale") === "mk" ? "mk" : "en",
        showInCommunity: form.get("showInCommunity") === "1",
        newsletterOptOut: form.get("newsletterOptOut") === "1",
      },
    });
  });
}

export default async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const quote = await prisma.quote.findUnique({ where: { userId: user.id } });
  const [cards, debts, pts] = await Promise.all([
    loadEventCards({ startsAt: { gte: new Date() }, reservations: { some: { userId: user.id, status: { not: "CANCELLED" } } } }, user.id),
    openDebts(prisma, user.id),
    myPoints(prisma, user.id),
  ]);
  return (
    <>
      <h1>{t.profile}</h1>
      <Flash sp={sp} locale={locale} />
      <section className="points card" aria-label={t.yourPoints}>
        <div className="points-big"><b>{pts.points}</b><span>{t.yourPoints}</span></div>
        <div className="stats">
          <div><b>{pts.events}</b><span>{t.termsAttended}</span></div>
          <div><b>{Number.isInteger(pts.hours) ? pts.hours : pts.hours.toFixed(1)}</b><span>{t.hoursPlayed}</span></div>
          <div><b>{pts.km}</b><span>{t.kmMoved}</span></div>
        </div>
        <p className="meta">{t.pointsHint}</p>
      </section>
      <div className="two" style={{ alignItems: "start", marginTop: 16 }}>
        <form action={saveProfile} className="card">
          <label htmlFor="name">{t.name}</label><input id="name" name="name" defaultValue={user.name} required />
          <div className="two">
            <div><label htmlFor="phone">{t.phone}</label><input id="phone" name="phone" defaultValue={user.phone ?? ""} /></div>
            <div><label htmlFor="instagram">{t.instagram}</label><input id="instagram" name="instagram" defaultValue={user.instagram ?? ""} /></div>
          </div>
          <label htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={2} maxLength={280} defaultValue={user.bio ?? ""} />
          <label htmlFor="about">{t.aboutMe}</label>
          <p className="meta" style={{ marginTop: 0 }}>{t.aboutMeHint}</p>
          <textarea id="about" name="about" rows={5} maxLength={800} defaultValue={user.about ?? ""} />
          <TopicsFields locale={locale} value={user.topics} />
          <LevelsFields locale={locale} value={(user.levels ?? {}) as Record<string, string>} />
          <label htmlFor="locale">{t.language}</label>
          <select id="locale" name="locale" defaultValue={user.locale}><option value="en">English</option><option value="mk">Македонски</option></select>
          <label className="row check" style={{ fontWeight: 400 }}><input type="checkbox" name="showInCommunity" value="1" defaultChecked={user.showInCommunity} /> {t.showInCommunity}</label>
          <label className="row check" style={{ fontWeight: 400 }}><input type="checkbox" name="newsletterOptOut" value="1" defaultChecked={user.newsletterOptOut} /> {t.newsletterOptOut}</label>
          <p style={{ marginTop: 16 }}><button className="btn" type="submit">{t.save}</button></p>
        </form>
        <div className="stack">
          {member ? <MemberCard user={user} locale={locale} /> : <div className="card"><p>{t.notMember}</p><a className="btn pink" href="/app/membership">{t.becomeMember}</a></div>}
          {user.creditBalance > 0 && <p className="notice">{t.credit}: <strong>{user.creditBalance} MKD</strong></p>}
          {debts.map((d) => <p key={d.id} className="notice">{t.yourDebt} ({d.event.title}): <strong>{d.amount} MKD</strong></p>)}
          {member && (
            <form action={doSaveQuote} className="card" id="quote">
              <label htmlFor="quote-text" style={{ marginTop: 0 }}>{t.yourQuote}</label>
              <textarea id="quote-text" name="quote" rows={2} maxLength={QUOTE_MAX} defaultValue={quote?.text ?? ""} />
              <p className="meta">{quote?.hidden ? t.quoteHidden : t.yourQuoteHint}</p>
              <p style={{ marginTop: 8 }}><button className="btn sm" type="submit">{t.save}</button></p>
            </form>
          )}
        </div>
      </div>
      <section style={{ marginTop: 28 }}>
        <h2>{t.myTerms}</h2>
        <div className="grid">{cards.map((e) => <EventCardView key={e.id} e={e} locale={locale} member={member} />)}</div>
        {cards.length === 0 && <p className="meta">{t.noEvents}</p>}
      </section>
      {!user.isOwner && (
        <section className="section card danger" id="delete" style={{ maxWidth: 560 }}>
          <h2>{t.deleteTitle}</h2>
          <p className="meta">{t.deleteText} <a href="/privacy">{t.privacyLink}</a></p>
          <form action={doDelete} className="row" style={{ marginTop: 10 }}>
            <input name="confirm" aria-label={t.deleteConfirm} placeholder={t.deleteConfirm} autoComplete="off" style={{ maxWidth: 220 }} />
            <button className="btn sm ghost" type="submit">{t.deleteButton}</button>
          </form>
        </section>
      )}
    </>
  );
}
