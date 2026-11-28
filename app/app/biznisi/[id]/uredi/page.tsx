import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { str } from "@/lib/act";
import { AppError } from "@/lib/services/common";
import { BUSINESS_MAX_PDFS, BUSINESS_MAX_PHOTOS, removeBusinessFile, updateBusiness } from "@/lib/services/businesses";
import { Flash } from "@/components/Flash";
import { ImageUploader, PdfUploader } from "@/components/Interactive";

async function save(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = str(form.get("id"));
  try {
    await updateBusiness(prisma, user.id, id, {
      name: str(form.get("name")), category: str(form.get("category")), description: str(form.get("description")),
      offer: str(form.get("offer")), instagram: str(form.get("instagram")), website: str(form.get("website")), contact: str(form.get("contact")),
      links: String(form.get("links") ?? ""),
    });
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/biznisi/${id}/uredi?err=${e.code}`);
    throw e;
  }
  revalidatePath(`/app/biznisi/${id}`);
  redirect(`/app/biznisi/${id}/uredi?ok=saved`);
}

async function removeFile(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = str(form.get("businessId"));
  await removeBusinessFile(prisma, user.id, str(form.get("fileId")));
  redirect(`/app/biznisi/${id}/uredi?ok=saved`);
}

export default async function EditBusiness({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const b = await prisma.memberBusiness.findUnique({ where: { id }, include: { files: { select: { id: true, kind: true, name: true }, orderBy: { createdAt: "asc" } } } });
  if (!b || (b.userId !== user.id && !user.isOwner)) notFound();
  const photos = b.files.filter((f) => f.kind === "IMAGE");
  const pdfs = b.files.filter((f) => f.kind === "PDF");
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <p><a href={`/app/biznisi/${b.id}`} className="meta">← {t.businessView}</a></p>
      <h1>{t.businessEditTitle}</h1>
      <Flash sp={sp} locale={locale} />

      <form action={save} className="card">
        <input type="hidden" name="id" value={b.id} />
        <div className="two">
          <div><label htmlFor="b-name">{t.businessName} *</label><input id="b-name" name="name" required maxLength={100} defaultValue={b.name} /></div>
          <div><label htmlFor="b-cat">{t.businessCategory} *</label><input id="b-cat" name="category" required maxLength={60} defaultValue={b.category} /></div>
        </div>
        <label htmlFor="b-desc">{t.businessDescription}</label>
        <textarea id="b-desc" name="description" rows={6} maxLength={1500} defaultValue={b.description ?? ""} />
        <label htmlFor="b-offer">{t.businessOffer}</label>
        <input id="b-offer" name="offer" maxLength={200} defaultValue={b.offer ?? ""} placeholder="пр. 15% попуст за членки на Скопјанки" />
        <div className="two">
          <div><label htmlFor="b-ig">{t.businessInstagram}</label><input id="b-ig" name="instagram" maxLength={60} placeholder="@" defaultValue={b.instagram ?? ""} /></div>
          <div><label htmlFor="b-web">{t.businessWebsite}</label><input id="b-web" name="website" maxLength={200} placeholder="https://" defaultValue={b.website ?? ""} /></div>
        </div>
        <label htmlFor="b-links">{t.businessLinks}</label>
        <textarea id="b-links" name="links" rows={3} defaultValue={b.links.join("\n")} placeholder="https://" />
        <label htmlFor="b-contact">{t.businessContact}</label>
        <input id="b-contact" name="contact" maxLength={80} defaultValue={b.contact ?? ""} />
        <p style={{ marginTop: 14 }}><button className="btn pink" type="submit">{t.save}</button></p>
      </form>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>{t.businessPhotos}</h2>
        {photos.length > 0 && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, margin: "10px 0" }}>
            {photos.map((p) => (
              <form key={p.id} action={removeFile} style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/biznis-files/${p.id}`} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, display: "block" }} />
                <input type="hidden" name="businessId" value={b.id} /><input type="hidden" name="fileId" value={p.id} />
                <button className="btn sm ghost" type="submit" style={{ marginTop: 4 }}>{t.remove}</button>
              </form>
            ))}
          </div>
        )}
        {photos.length < BUSINESS_MAX_PHOTOS && (
          <ImageUploader endpoint="/api/business-file" fields={{ businessId: b.id }} label={t.businessAddPhoto} uploading={t.uploading} failed={t.uploadFailed} />
        )}
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>{t.businessPdfs}</h2>
        {pdfs.length > 0 && (
          <ul className="desk-list" style={{ margin: "10px 0" }}>
            {pdfs.map((p) => (
              <li key={p.id}>
                <a href={`/biznis-files/${p.id}`} target="_blank" rel="noopener noreferrer">📄 {p.name}</a>
                <form action={removeFile}><input type="hidden" name="businessId" value={b.id} /><input type="hidden" name="fileId" value={p.id} /><button className="btn sm ghost" type="submit">{t.remove}</button></form>
              </li>
            ))}
          </ul>
        )}
        {pdfs.length < BUSINESS_MAX_PDFS && (
          <PdfUploader endpoint="/api/business-file" fields={{ businessId: b.id }} label={t.businessAddPdf} uploading={t.uploading} failed={t.uploadFailed} />
        )}
      </section>
    </div>
  );
}
