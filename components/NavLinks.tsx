"use client";

import { usePathname, useSearchParams } from "next/navigation";

export type NavItem = { href: string; label: string };

/** Tabs under the logo, the current one underlined (as in the prototype). */
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
  return (
    <>
      {items.map((i) => (
        <a key={i.href} href={i.href} aria-current={current(i.href) ? "page" : undefined}>
          {i.label}
        </a>
      ))}
    </>
  );
}
