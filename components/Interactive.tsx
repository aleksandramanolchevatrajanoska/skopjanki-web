"use client";

import { useEffect, useRef, useState } from "react";

/** Native share where the phone supports it; otherwise Copy, WhatsApp, Viber and Email. */
export function ShareButton({ url, title, labels }: { url: string; title: string; labels: { share: string; copyLink: string; copied: string } }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const full = typeof window === "undefined" ? url : new URL(url, window.location.origin).toString();
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url: full });
        return;
      } catch {
        /* cancelled: fall through to the menu */
      }
    }
    setOpen((o) => !o);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }
  const text = encodeURIComponent(`${title} ${full}`);
  return (
    <span className="share">
      <button type="button" className="btn ghost sm" onClick={share} aria-expanded={open}>↗ {labels.share}</button>
      {open && (
        <span className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn sm ghost" onClick={copy}>{copied ? labels.copied : labels.copyLink}</button>
          <a className="btn sm ghost" href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a className="btn sm ghost" href={`viber://forward?text=${text}`}>Viber</a>
          <a className="btn sm ghost" href={`mailto:?subject=${encodeURIComponent(title)}&body=${text}`}>Email</a>
        </span>
      )}
    </span>
  );
}

export function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn sm ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {}
      }}
    >
      {ok ? done : label}
    </button>
  );
}

/** Makes photos at most 1600 px and JPEG before upload, so phones' 8 MB photos fit. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.85));
}

export function PhotoUploader({ eventId, labels }: { eventId: string; labels: { addPhotos: string; uploading: string; uploadFailed: string } }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const f of files) {
        const blob = await shrink(f);
        const fd = new FormData();
        fd.append("eventId", eventId);
        fd.append("photo", blob, "photo.jpg");
        const res = await fetch("/api/photos", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message ?? labels.uploadFailed);
        }
      }
      window.location.reload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : labels.uploadFailed);
      setBusy(false);
    }
  }
  return (
    <div>
      <label className="btn pink sm" style={{ display: "inline-block", margin: 0 }}>
        {busy ? labels.uploading : `+ ${labels.addPhotos}`}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy} onChange={onChange} />
      </label>
      {err && <p className="notice err" role="alert">{err}</p>}
    </div>
  );
}

export type Slide = { src?: string; alt: string; partner?: { name: string; activity: string; address?: string | null; mapsUrl?: string | null; instagram?: string | null } };

/** Moments card: opens a carousel with the event photos plus one slide per partner. */
export function MomentCarousel({ cover, title, meta, slides, eventHref, seeEvent }: { cover: string | null; title: string; meta: string; slides: Slide[]; eventHref?: string; seeEvent: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const n = slides.length;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
    };
    d.addEventListener("keydown", key);
    return () => d.removeEventListener("keydown", key);
  }, [n]);
  const s = slides[i];
  return (
    <>
      <button type="button" className="moment" onClick={() => { setI(0); ref.current?.showModal(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover ? <img src={cover} alt="" loading="lazy" /> : <span className="moment-empty">♛ ♛</span>}
        <span className="moment-cap"><strong>{title}</strong><span>{meta}</span></span>
      </button>
      <dialog ref={ref} className="carousel" aria-label={title} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="between">
          <strong>{title}</strong>
          <button type="button" className="btn sm ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
        </div>
        <div className="slide">
          {s?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.src} alt={s.alt} />
          ) : s?.partner ? (
            <div className="partner-slide">
              <p className="label">Partner</p>
              <h3>{s.partner.name}</h3>
              <p className="meta">{s.partner.activity}</p>
              {s.partner.address && <p>{s.partner.address}</p>}
              <p className="row" style={{ justifyContent: "center" }}>
                {s.partner.mapsUrl && <a className="btn sm ghost" href={s.partner.mapsUrl} target="_blank" rel="noopener noreferrer">Maps</a>}
                {s.partner.instagram && <a className="btn sm ghost" href={`https://instagram.com/${s.partner.instagram}`} target="_blank" rel="noopener noreferrer">@{s.partner.instagram}</a>}
              </p>
            </div>
          ) : null}
        </div>
        <div className="between">
          <span className="row">
            <button type="button" className="btn sm ghost" onClick={() => setI((i - 1 + n) % n)} disabled={n < 2} aria-label="Previous">←</button>
            <span className="meta">{n ? i + 1 : 0} / {n}</span>
            <button type="button" className="btn sm ghost" onClick={() => setI((i + 1) % n)} disabled={n < 2} aria-label="Next">→</button>
          </span>
          {eventHref && <a className="btn sm pink" href={eventHref}>{seeEvent}</a>}
        </div>
      </dialog>
    </>
  );
}

export function AskBox({ labels, examples = [] }: { labels: { askTitle: string; askPlaceholder: string; askButton: string; askThinking: string; askError: string; askNote: string }; examples?: string[] }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e?: React.FormEvent, question = q) {
    e?.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setA(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const j = await res.json().catch(() => ({}));
      setA(res.ok && j.answer ? j.answer : j.message ?? labels.askError);
    } catch {
      setA(labels.askError);
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="ask">
      <label htmlFor="ask-q">{labels.askTitle}</label>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input id="ask-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder={labels.askPlaceholder} />
        <button className="btn pink" type="submit" disabled={busy}>{busy ? labels.askThinking : labels.askButton}</button>
      </div>
      {examples.length > 0 && (
        <div className="row" style={{ marginTop: 8 }}>
          {examples.map((x) => (
            <button key={x} type="button" className="mood-btn" style={{ border: 0, cursor: "pointer" }} onClick={() => { setQ(x); submit(undefined, x); }}>{x}</button>
          ))}
        </div>
      )}
      <div aria-live="polite">{a && <p className="ask-answer">{a}</p>}</div>
      <p className="meta" style={{ fontSize: ".78rem" }}>{labels.askNote}</p>
    </form>
  );
}

/** The hero card from the prototype: front "See you at the next one.", back the core team photo. */
export function FlipCard({ front, back, team, hint, soon }: { front: string; back: string; team: string | null; hint: string; soon: string }) {
  const [on, setOn] = useState(false);
  return (
    <button type="button" className={`flipper${on ? " on" : ""}`} onClick={() => setOn(!on)} aria-label={back}>
      <span className="face front">
        <span className="badge"><QueensMark /></span>
        <span>
          <span className="ft">{front}</span>
          <small>@skopjankii · {hint}</small>
        </span>
      </span>
      <span className="face back">
        {team ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team} alt={back} />
        ) : (
          <span className="ph"><span className="badge dark"><QueensMark /></span><span>{soon}</span></span>
        )}
        <small className="cap">{back}</small>
      </span>
    </button>
  );
}

function QueensMark() {
  const q = (
    <g>
      <polygon fill="#DE86BC" points="113,66 152,96 180,32 208,96 246,66 232,125 127,125" />
      <circle cx="180" cy="185" r="45" fill="currentColor" />
      <polygon fill="currentColor" points="158,232 202,232 205,255 250,262 212,345 268,548 98,548 150,345 112,262 155,255" />
    </g>
  );
  return <svg viewBox="92 24 400 530" aria-hidden="true">{q}<g transform="translate(218 0)">{q}</g></svg>;
}
