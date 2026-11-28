import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { str } from "@/lib/act";
import { AppError } from "@/lib/services/common";
import { removeBusiness, submitBusiness } from "@/lib/services/businesses";
import { safeUrl } from "@/lib/services/club";
import { Flash } from "@/components/Flash";

async function add(form: FormData) {
  "use server";
  const user = await requireApproved();
  try {
    await submitBusiness(prisma, user.id, {
      name: str(form.get("name")), category: str(form.get("category")), description: str(form.get("description")),
      offer: str(form.get("offer")), instagram: str(form.get("instagram")), website: str(form.get("website")), contact: str(form.get("contact")),
    });
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/biznisi?err=${e.code}#dodaj`);
    throw e;
  }
  redirect("/app/biznisi?ok=businessSent#dodaj");
}

async function remove(form: FormData) {
  "use server";
  const user = await requireApproved();
  await removeBusiness(prisma, user.id, str(form.get("id")));
  revalidatePath("/app/biznisi");
}

/** Businesses run by members, for the other girls. Discounts show to members only. */
export default async function Businesses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const member = isMember(user);
  const [list, mine] = await Promise.all([
    prisma.memberBusiness.findMany({ where: { status: "APPROVED" }, include: { user: { select: { name: true } }, files: { where: { kind: { in: ["LOGO", "IMAGE"] } }, select: { id: true, kind: true }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } }),
    prisma.memberBusiness.findMany({ where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } }, orderBy: { createdAt: "asc" } }),
  ]);
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <>
      <h1>{t.businessesTitle}</h1>
      <p className="meta" style={{ maxWidth: "62ch" }}>{t.businessesIntro}</p>
      <Flash sp={sp} locale={locale} />

      {list.length === 0 ? (
        <p className="meta" style={{ marginTop: 16 }}>{t.businessesEmpty}</p>
      ) : (
        <div className="grid" style={{ marginTop: 20 }}>
          {list.map((b) => {
            const site = safeUrl(b.website);
            const ig = b.instagram ? `https://instagram.com/${b.instagram}` : null;
            return (
              <div className="card partner" key={b.id}>
                <div className="partner-head">
                  <span className="partner-logo">
                    {(b.files.find((f) => f.kind === "LOGO") ?? b.files[0]) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/biznis-files/${(b.files.find((f) => f.kind === "LOGO") ?? b.files[0]).id}`} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </span>
                  <div>
                    <h3><a href={`/app/biznisi/${b.id}`}>{b.name}</a></h3>
                    <p className="meta" style={{ margin: 0 }}>{b.category} · {b.user.name}</p>
                  </div>
                </div>
                {b.description && <p style={{ margin: 0 }}>{b.description.length > 180 ? `${b.description.slice(0, 180)}…` : b.description}</p>}
                {b.contact && <p className="meta" style={{ margin: 0 }}>☏ {b.contact}</p>}
                <p className="row" style={{ marginTop: 4 }}>
                  {site && <a className="btn sm ghost" href={site} {...ext}>{t.website}</a>}
                  {ig && <a className="btn sm ghost" href={ig} {...ext}>@{b.instagram}</a>}
                </p>
                <p style={{ margin: 0 }}><a className="btn sm" href={`/app/biznisi/${b.id}`}>{t.businessMore} →</a></p>
                {b.offer && (
                  <div className="offer">
                    <p className="label">{t.partnerOffer}</p>
                    {member ? <p>{b.offer}</p> : <p className="meta">{t.businessMembersOnly}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <section id="dodaj" className="section" style={{ marginTop: 36 }}>
        <h2>{t.businessAdd}</h2>
        <p className="meta">{t.businessAddHint}</p>
        {mine.length > 0 && (
          <div style={{ margin: "12px 0" }}>
            <p className="label">{t.businessMine}</p>
            <ul className="desk-list">
              {mine.map((b) => (
                <li key={b.id}>
                  <span><a href={`/app/biznisi/${b.id}`}>{b.name}</a> {b.status === "PENDING" && <span className="tag">{t.businessPending}</span>}</span>
                  <span className="row">
                  <a className="btn sm" href={`/app/biznisi/${b.id}/uredi`}>✎ {t.businessEdit}</a>
                  <form action={remove}><input type="hidden" name="id" value={b.id} /><button className="btn sm ghost" type="submit">{t.remove}</button></form>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {member ? (
          <form action={add} className="card" style={{ maxWidth: 640 }}>
            <div className="two">
              <div><label htmlFor="b-name">{t.businessName} *</label><input id="b-name" name="name" required maxLength={100} /></div>
              <div><label htmlFor="b-cat">{t.businessCategory} *</label><input id="b-cat" name="category" required maxLength={60} placeholder="пр. козметика, накит, кафе, фотографија" /></div>
            </div>
            <label htmlFor="b-desc">{t.businessDescription}</label>
            <textarea id="b-desc" name="description" rows={3} maxLength={600} />
            <label htmlFor="b-offer">{t.businessOffer}</label>
            <input id="b-offer" name="offer" maxLength={200} placeholder="пр. 15% попуст за членки на Скопјанки" />
            <div className="two">
              <div><label htmlFor="b-ig">{t.businessInstagram}</label><input id="b-ig" name="instagram" maxLength={60} placeholder="@" /></div>
              <div><label htmlFor="b-web">{t.businessWebsite}</label><input id="b-web" name="website" maxLength={200} placeholder="https://" /></div>
            </div>
            <label htmlFor="b-contact">{t.businessContact}</label>
            <input id="b-contact" name="contact" maxLength={80} />
            <p style={{ marginTop: 14 }}><button className="btn pink" type="submit">{t.businessSubmit}</button></p>
          </form>
        ) : (
          <p><a className="btn pink" href="/app/membership">{t.becomeMember}</a> <span className="meta">{t.businessMembersOnly}</span></p>
        )}
      </section>
    </>
  );
}
