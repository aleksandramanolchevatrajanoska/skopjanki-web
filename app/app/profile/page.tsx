import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { attempt, str } from "@/lib/act";
import { loadEventCards } from "@/lib/views";
import { openDebts } from "@/lib/services/attendance";
import { EventCardView } from "@/components/EventCardView";
import { Flash } from "@/components/Flash";
import { LevelsFields, readLevels } from "@/components/LevelsFields";
import { MemberCard } from "@/components/MemberCard";

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
        levels: readLevels(form),
        locale: form.get("locale") === "mk" ? "mk" : "en",
      },
    });
  });
}

export default async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const [cards, debts] = await Promise.all([
    loadEventCards({ startsAt: { gte: new Date() }, reservations: { some: { userId: user.id, status: { not: "CANCELLED" } } } }, user.id),
    openDebts(prisma, user.id),
  ]);
  return (
    <>
      <h1>{t.profile}</h1>
      <Flash sp={sp} locale={locale} />
      <div className="two" style={{ alignItems: "start", marginTop: 16 }}>
        <form action={saveProfile} className="card">
          <label htmlFor="name">{t.name}</label><input id="name" name="name" defaultValue={user.name} required />
          <div className="two">
            <div><label htmlFor="phone">{t.phone}</label><input id="phone" name="phone" defaultValue={user.phone ?? ""} /></div>
            <div><label htmlFor="instagram">{t.instagram}</label><input id="instagram" name="instagram" defaultValue={user.instagram ?? ""} /></div>
          </div>
          <label htmlFor="bio">Bio</label><textarea id="bio" name="bio" rows={2} maxLength={280} defaultValue={user.bio ?? ""} />
          <LevelsFields locale={locale} value={(user.levels ?? {}) as Record<string, string>} />
          <label htmlFor="locale">{t.language}</label>
          <select id="locale" name="locale" defaultValue={user.locale}><option value="en">English</option><option value="mk">Македонски</option></select>
          <p style={{ marginTop: 16 }}><button className="btn" type="submit">{t.save}</button></p>
        </form>
        <div className="stack">
          {member ? <MemberCard user={user} locale={locale} /> : <div className="card"><p>{t.notMember}</p><a className="btn pink" href="/app/membership">{t.becomeMember}</a></div>}
          {user.creditBalance > 0 && <p className="notice">{t.credit}: <strong>{user.creditBalance} MKD</strong></p>}
          {debts.map((d) => <p key={d.id} className="notice">{t.yourDebt} ({d.event.title}): <strong>{d.amount} MKD</strong></p>)}
        </div>
      </div>
      <section style={{ marginTop: 28 }}>
        <h2>{t.myTerms}</h2>
        <div className="grid">{cards.map((e) => <EventCardView key={e.id} e={e} locale={locale} member={member} />)}</div>
        {cards.length === 0 && <p className="meta">{t.noEvents}</p>}
      </section>
    </>
  );
}
