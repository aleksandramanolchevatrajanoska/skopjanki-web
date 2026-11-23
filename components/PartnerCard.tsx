import type { Partner } from "@prisma/client";
import { dicts, type Locale } from "@/lib/i18n";
import { CopyButton } from "./Interactive";

/** Partner card: the discount code is sent to the page only for members; others see a blurred placeholder. */
export function PartnerCard({ p, locale, member }: { p: Partner; locale: Locale; member: boolean }) {
  const t = dicts[locale];
  const ig = p.instagram?.replace(/^@/, "");
  return (
    <div className="card tilt-alt">
      <h3>{p.name}</h3>
      <p className="meta">{p.activity}</p>
      {p.address && <p className="meta">{p.address}</p>}
      <p className="row" style={{ marginTop: 6 }}>
        {p.mapsUrl && <a className="btn sm ghost" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">Maps</a>}
        {ig && <a className="btn sm ghost" href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer">@{ig}</a>}
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
