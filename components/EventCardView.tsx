import type { EventCard } from "@/lib/views";
import { fmtRange } from "@/lib/views";
import { dicts, type Locale } from "@/lib/i18n";
import { formatDateTime } from "@/lib/time";

export function EventCardView({ e, locale, member }: { e: EventCard; locale: Locale; member: boolean }) {
  const t = dicts[locale];
  const pct = Math.min(100, Math.round((e.confirmed / Math.max(1, e.maxSpots)) * 100));
  const past = e.startsAt < new Date();
  return (
    <a href={`/app/events/${e.id}`} className="card" style={{ textDecoration: "none", display: "block" }}>
      {(e.hasPoster || e.imageUrl) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.hasPoster ? `/posters/${e.id}` : e.imageUrl!} alt={`${e.title} poster`} className="evimg" loading="lazy" />
      )}
      <div className="between">
        <span>
          <span className={`tag ${e.kind === "FUSION" ? "p" : e.kind === "SPECIAL" ? "c" : ""}`}>{t.kinds[e.kind]}</span>
          {e.sport && <span className="tag c">{e.sport}{e.level ? ` · ${t.levels[e.level] ?? e.level}` : ""}</span>}
          {e.vibe && <span className="tag">{t.vibes[e.vibe]}</span>}
          {e.example && <span className="tag">{t.exampleTag}</span>}
          {e.status === "PENDING" && <span className="tag">{t.pendingApproval}</span>}
          {e.status === "CANCELLED" && <span className="tag">✕</span>}
        </span>
        {e.mine && <span className="tag p">{e.mine.status === "WAITLIST" ? t.waitlist : t.you}</span>}
      </div>
      <h3 style={{ marginTop: 8 }}>{e.title}</h3>
      {e.tagline && <p style={{ margin: 0 }}>{e.tagline}</p>}
      <p className="meta">{formatDateTime(e.startsAt, locale)}{e.partner ? ` · ${e.partner.name}` : e.place ? ` · ${e.place}` : ""}</p>
      {!past && <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>}
      {!past && <p className="meta">{e.confirmed} / {e.maxSpots} {t.going}{e.waiting ? ` · ${e.waiting} ${t.waitlist}` : ""}</p>}
      {e.range && (
        <p style={{ marginTop: 6 }}>
          <strong>{fmtRange(member ? e.range.member : e.range.nonMember)} MKD</strong>{" "}
          <span className="meta">{member ? t.member : t.nonMember}{!member ? ` · ${t.member}: ${fmtRange(e.range.member)}` : ""}</span>
        </p>
      )}
    </a>
  );
}
