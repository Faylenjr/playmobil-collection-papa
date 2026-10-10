"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  ["/", "⌂", "Accueil"],
  ["/catalogue", "⌕", "Catalogue"],
  ["/collection", "✓", "Collection"],
  ["/recherches", "♡", "Recherches"],
] as const;

const more = [["/collection/ajouter", "+ Ajouter"], ["/collection/inventaire", "Inventaire"], ["/collection/vitrine", "Vitrine"], ["/nouveautes", "Nouveautés"], ["/gammes", "Gammes"], ["/themes", "Thèmes"], ["/pays", "Pays"], ["/collection/statistiques", "Statistiques"]] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return <nav className="mobile-bottom-nav" aria-label="Navigation principale mobile">
    {primary.map(([href, icon, label]) => <Link key={href} href={href} className={active(href) ? "active" : ""} aria-current={active(href) ? "page" : undefined}><span aria-hidden="true">{icon}</span><small>{label}</small></Link>)}
    <details className="mobile-more"><summary><span aria-hidden="true">•••</span><small>Plus</small></summary><div>{more.map(([href, label]) => <Link key={href} href={href} className={active(href) ? "active" : ""}>{label}</Link>)}</div></details>
  </nav>;
}
