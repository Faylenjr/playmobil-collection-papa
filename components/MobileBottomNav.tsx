"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  ["/", "⌂", "Accueil"],
  ["/catalogue", "⌕", "Catalogue"],
  ["/collection", "✓", "Collection"],
  ["/recherches", "♡", "Recherches"],
] as const;

const groups = [
  { label: "Explorer", items: [["/nouveautes", "Nouveautés"], ["/themes", "Thèmes & gammes"], ["/pays", "Pays"], ["/bons-plans", "Bons plans"]] },
  { label: "Collection", items: [["/collection/ajouter", "+ Ajouter"], ["/collection/inventaire", "Inventaire"], ["/collection/a-renseigner", "À renseigner"], ["/collection/vitrine", "Vitrine"], ["/collection/statistiques", "Statistiques"]] },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return <nav className="mobile-bottom-nav" aria-label="Navigation principale mobile">
    {primary.map(([href, icon, label]) => <Link key={href} href={href} className={active(href) ? "active" : ""} aria-current={active(href) ? "page" : undefined}><span aria-hidden="true">{icon}</span><small>{label}</small></Link>)}
    <details className="mobile-more"><summary><span aria-hidden="true">•••</span><small>Plus</small></summary><div>{groups.map((group) => <section key={group.label}><strong>{group.label}</strong>{group.items.map(([href, label]) => <Link key={href} href={href} className={active(href) ? "active" : ""}>{label}</Link>)}</section>)}</div></details>
  </nav>;
}
