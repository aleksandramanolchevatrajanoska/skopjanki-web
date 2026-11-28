import { notFound } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { isMember } from "@/lib/membership";
import { safeUrl } from "@/lib/services/club";
import { MediaCarousel, ShareButton } from "@/components/Interactive";

/** One page per member business: photos, story, links, PDFs and the member offer. */
export default async function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireApproved();
  const { t } = await getT(user.locale);
  const b = await prisma.memberBusiness.findUnique({
    where: { id },
    include: { user: { select: { name: true } }, files: { select: { id: true, kind: true, name: true }, orderBy: { createdAt: "asc" } } },
  });
  const mine = b != null && (b.userId === user.id || user.isOwner);
  if (!b || (b.status !== "APPROVED" && !mine)) notFound();
  const member = isMember(user);
  const site = safeUrl(b.website);
  const ig = b.instagram ? `https://instagram.com/${b.instagram}` : null;
  const photos = b.files.filter((f) => f.kind === "IMAGE");
  const pdfs = b.files.filter((f) => f.kind === "PDF");
  const links = b.links.map((l) => ({ raw: l, url: safeUrl(l) })).filter((l) => l.url);
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p><a href="/app/biznisi" className="meta">← {t.businessBack}</a></p>
      <div className="between" style={{ alignItems: "flex-start" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{b.name}</h1>
          <p className="meta" style={{ margin: 0 }}>{b.category} · {b.user.name}</p>
          {b.status === "PENDING" && <span className="tag" style={{ marginTop: 6, display: "inline-block" }}>{t.businessPending}</span>}
        </div>
        <div className="row">
          <ShareButton url={`/app/biznisi/${b.id}`} title={`Skopjanki: ${b.name}`} labels={{ share: t.share, copyLink: t.copyLink, copied: t.copied }} />
          {mine && <a className="btn sm" href={`/app/biznisi/${b.id}/uredi`}>✎ {t.businessEdit}</a>}
        </div>
      </div>

      {photos.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <MediaCarousel slides={photos.map((p) => ({ type: "image" as const, src: `/biznis-files/${p.id}`, alt: b.name }))} labels={{ prev: "‹", next: "›" }} />
        </div>
      )}

      {b.offer && (
        <div className="offer" style={{ marginTop: 18 }}>
          <p className="label">{t.partnerOffer}</p>
          {member ? <p style={{ fontSize: "1.15em" }}><strong>{b.offer}</strong></p> : <p className="meta">{t.businessMembersOnly} <a href="/app/membership">{t.becomeMember}</a></p>}
        </div>
      )}

      {b.description && <p style={{ marginTop: 18, whiteSpace: "pre-wrap" }}>{b.description}</p>}

      <div className="row" style={{ marginTop: 18, flexWrap: "wrap" }}>
        {site && <a className="btn sm pink" href={site} {...ext}>{t.website} ↗</a>}
        {ig && <a className="btn sm ghost" href={ig} {...ext}>@{b.instagram}</a>}
        {links.map((l) => <a key={l.raw} className="btn sm ghost" href={l.url!} {...ext}>{new URL(l.url!).hostname.replace(/^www\./, "")} ↗</a>)}
      </div>

      {pdfs.length > 0 && (
        <ul className="desk-list" style={{ marginTop: 18 }}>
          {pdfs.map((p) => (
            <li key={p.id}><a href={`/biznis-files/${p.id}`} {...ext}>📄 {p.name}</a></li>
          ))}
        </ul>
      )}

      {b.contact && <p className="meta" style={{ marginTop: 18 }}>☏ {b.contact}</p>}
    </div>
  );
}
