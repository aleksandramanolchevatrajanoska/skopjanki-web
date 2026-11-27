import { notFound, redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { AppError } from "@/lib/services/common";
import { canEditEvent, editEvent } from "@/lib/services/events";
import { EventFields, readEventForm } from "@/components/EventFields";
import { ImageUploader } from "@/components/Interactive";
import { posterUrl } from "@/lib/views";
import { Flash } from "@/components/Flash";

async function save(form: FormData) {
  "use server";
  const user = await requireApproved();
  const id = String(form.get("id"));
  const input = readEventForm(form);
  if (isNaN(input.startsAt.getTime())) redirect(`/app/events/${id}/edit?err=BAD_INPUT`);
  try {
    await editEvent(prisma, user.id, id, input);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/events/${id}/edit?err=${e.code}`);
    throw e;
  }
  redirect(`/app/events/${id}?ok=saved`);
}

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireApproved();
  const { t, locale } = await getT(user.locale);
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) notFound();
  if (!canEditEvent(user, e)) redirect(`/app/events/${id}`);
  const [partners, hasPoster] = await Promise.all([
    prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.eventPoster.findUnique({ where: { eventId: id }, select: { updatedAt: true } }),
  ]);
  return (
    <div style={{ maxWidth: 720 }}>
      <p><a href={`/app/events/${id}`} className="meta">← {e.title}</a></p>
      <h1>{t.editEvent}</h1>
      <p className="meta">{t.editEventHint}</p>
      <Flash sp={sp} locale={locale} />
      <section className="card" style={{ marginTop: 16 }}>
        <h3>{t.planPhoto}</h3>
        {hasPoster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterUrl(id, hasPoster?.updatedAt)} alt="" style={{ maxWidth: 180, borderRadius: 4, display: "block", marginBottom: 12 }} />
        )}
        {user.isOwner ? (
          <ImageUploader endpoint="/api/admin/poster" fields={{ eventId: id }} label={hasPoster ? t.replacePicture : t.uploadPicture} uploading={t.uploading} failed={t.uploadFailed} />
        ) : (
          <p className="meta">{t.pictureByOrganiser}</p>
        )}
      </section>
      <form action={save} className="card" style={{ marginTop: 16 }}>
        <input type="hidden" name="id" value={id} />
        {!user.isOwner && <input type="hidden" name="kind" value={e.kind} />}
        <EventFields locale={locale} partners={partners} e={e} owner={user.isOwner} />
        <p style={{ marginTop: 16 }}><button className="btn pink" type="submit">{t.save}</button></p>
      </form>
    </div>
  );
}
