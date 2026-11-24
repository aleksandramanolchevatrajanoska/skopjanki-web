import type { Partner } from "@prisma/client";
import { dicts, type Locale } from "@/lib/i18n";
import { safeUrl } from "@/lib/services/club";
import { CopyButton } from "./Interactive";

export type PartnerWithLogo = Partner & { logo?: { updatedAt: Date } | null };

/**
 * Partner card: logo, address, contact, and the name and logo link straight to the partner's
 * website (or Instagram). The discount code reaches the page only for members.
 */
export function PartnerCard({ p, locale, member }: { p: PartnerWithLogo; locale: Locale; member: boolean }) {
  const t = dicts[locale];
  const ig = p.instagram?.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
  const igUrl = ig ? `https://instagram.com/${ig}` : null;
  const site = safeUrl(p.website);
  const main = site ?? igUrl;
  const maps = safeUrl(p.mapsUrl) ?? (p.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.address}`)}` : null);
  const contact = p.contact?.trim();
  const contactHref = contact ? (contact.includes("@") ? `mailto:${contact}` : `tel:${contact.replace(/[^\d+]/g, "")}`) : null;
  const logo = p.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/partner-logos/${p.id}?v=${p.logo.updatedAt.getTime()}`} alt="" />
  ) : (
    <span aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
  );
  const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <div className="card partner">
      <div className="partner-head">
        {main ? <a className="partner-logo" href={main} {...ext} tabIndex={-1} aria-hidden="true">{logo}</a> : <span className="partner-logo">{logo}</span>}
        <div>
          <h3>{main ? <a href={main} {...ext}>{p.name} <span aria-hidden="true">↗</span></a> : p.name}</h3>
          <p className="meta" style={{ margin: 0 }}>{p.activity}</p>
        </div>
      </div>
      <ul className="partner-info">
        {p.address && <li><span aria-hidden="true">⌖</span>{maps ? <a href={maps} {...ext}>{p.address}</a> : p.address}</li>}
        {contact && <li><span aria-hidden="true">☏</span><a href={contactHref!}>{contact}</a></li>}
      </ul>
      <p className="row" style={{ marginTop: 4 }}>
        {site && <a className="btn sm ghost" href={site} {...ext}>{t.website}</a>}
        {igUrl && <a className="btn sm ghost" href={igUrl} {...ext}>@{ig}</a>}
      </p>
      {(p.offer || p.code) && (
        <div className="offer">
          <p className="label">{t.partnerOffer}</p>
          {p.offer && <p>{p.offer}</p>}
          {p.code &&
            (member ? (
              <p className="row"><span>{t.partnerCode}:</span> <code className="code">{p.code}</code> <CopyButton value={p.code} label={t.copy} done={t.copied} /></p>
            ) : (
              <p className="row"><span>{t.partnerCode}:</span> <code className="code blurred" aria-hidden="true">SKOPJANKI</code> <span className="meta">{t.codeLocked}</span></p>
            ))}
        </div>
      )}
    </div>
  );
}
