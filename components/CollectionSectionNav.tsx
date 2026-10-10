import Link from "next/link";

const items = [
  ["/collection", "Ma collection"],
  ["/collection/ajouter", "+ Ajouter"],
  ["/collection/inventaire", "Inventaire"],
  ["/collection/a-renseigner", "À renseigner"],
  ["/collection?multiple=yes", "Multiples"],
  ["/collection/vitrine", "Vitrine"],
  ["/collection/statistiques", "Statistiques"],
] as const;

export function CollectionSectionNav() {
  return <nav className="section-nav" aria-label="Outils de ma collection">{items.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}</nav>;
}
