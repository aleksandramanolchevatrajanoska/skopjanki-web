"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = { href: string; label: string };

/**
 * Tabs under the logo, the current one underlined. When they do not all fit, a slider under them
 * shows there are more, arrows scroll them, and the current tab is scrolled into view.
 */
export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const sp = useSearchParams();
  const kind = sp.get("kind");
  const current = (href: string) => {
    const u = new URL(href, "http://x");
    if (u.pathname !== path) return path.startsWith(u.pathname + "/") && u.pathname !== "/" && u.pathname !== "/app";
    const k = u.searchParams.get("kind");
    return k ? k === kind : u.pathname !== "/app" || !kind;
  };
  const ref = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ over: false, left: 0, width: 100, atStart: true, atEnd: true });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const over = el.scrollWidth > el.clientWidth + 2;
      setM({
        over,
        width: over ? (el.clientWidth / el.scrollWidth) * 100 : 100,
        left: over ? (el.scrollLeft / el.scrollWidth) * 100 : 0,
        atStart: el.scrollLeft <= 2,
        atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
      });
    };
    const active = el.querySelector<HTMLElement>('a[aria-current="page"]');
    if (active && active.offsetLeft + active.offsetWidth > el.clientWidth) {
      el.scrollLeft = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    }
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [path, kind]);

  const go = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });

  return (
    <div className={`tabs-wrap${m.over ? " over" : ""}${m.atStart ? " at-start" : ""}${m.atEnd ? " at-end" : ""}`}>
      {m.over && !m.atStart && <button type="button" className="tabs-arrow left" onClick={() => go(-1)} aria-label="‹">‹</button>}
      <div className="tabs-scroll" ref={ref}>
        {items.map((i) => (
          <a key={i.href} href={i.href} aria-current={current(i.href) ? "page" : undefined}>
            {i.label}
          </a>
        ))}
      </div>
      {m.over && !m.atEnd && <button type="button" className="tabs-arrow right" onClick={() => go(1)} aria-label="›">›</button>}
      {m.over && (
        <div className="tabs-slider" aria-hidden="true">
          <i style={{ width: `${m.width}%`, left: `${m.left}%` }} />
        </div>
      )}
    </div>
  );
}
