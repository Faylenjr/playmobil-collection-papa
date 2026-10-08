import Link from "next/link";
import { DiscoveryProductCard } from "../../../components/DiscoveryProductCard";
import { getCollectionInsights } from "../../../lib/collector-insights";
import { getFrenchThemeName } from "../../../lib/theme-names";

export const dynamic = "force-dynamic";

export default async function CollectionStatsPage() {
  const stats = await getCollectionInsights();
  const knownYears = stats.years.reduce((sum, item) => sum + item.count, 0);
  return <div className="page-shell listing-page collection-stats-page">
    <Link href="/collection" className="back-link">← Ma collection</Link>
    <section className="page-heading themes-heading"><span className="eyebrow">Vue d’ensemble</span><h1>Statistiques de ma collection</h1><p>Des repères utiles basés uniquement sur les données connues. Les années inconnues ne sont pas intégrées à la chronologie.</p></section>
    <section className="collector-kpis" aria-label="Résumé de la collection"><article><strong>{stats.totalCopies}</strong><span>exemplaires</span></article><article><strong>{stats.distinctVariants}</strong><span>références/variantes</span></article><article><strong>{stats.distinctProducts}</strong><span>produits distincts</span></article><article><strong>{stats.wishlist}</strong><span>recherchés</span></article></section>
    <section className="insight-columns">
      <article className="insight-panel"><div className="section-title"><div><span className="eyebrow">Univers représentés</span><h2>Mes thèmes principaux</h2></div></div><ol className="insight-list">{stats.themes.slice(0, 12).map((theme) => <li key={theme.slug}><Link href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`}>{getFrenchThemeName(theme)}</Link><strong>{theme.count} produit{theme.count > 1 ? "s" : ""}</strong></li>)}</ol><small>Comptage par produit distinct possédé, parmi les rattachements de thème documentés.</small></article>
      <article className="insight-panel"><div className="section-title"><div><span className="eyebrow">Chronologie fiable</span><h2>Mes produits par année</h2></div></div><div className="year-cloud">{stats.years.map((item) => <Link href={`/catalogue?year=${item.year}`} key={item.year}><strong>{item.year}</strong><span>{item.count} possédés</span></Link>)}</div><small>{knownYears} produits possédés ont une année exploitable. Aucun taux de complétion historique n’est inventé.</small></article>
    </section>
    <section className="latest-section" id="multiples"><div className="section-title"><div><span className="eyebrow">Échanges et doubles</span><h2>Mes multiples</h2><p>Une quantité supérieure à 1 est volontairement conservée et n’est jamais traitée comme une erreur.</p></div><strong>{stats.multiples.length} référence{stats.multiples.length > 1 ? "s" : ""}</strong></div>{stats.multiples.length ? <div className="catalogue-grid">{stats.multiples.map(({ variant, quantity }) => <DiscoveryProductCard key={variant.id} product={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, imageUrl: variant.media[0]?.sourceUrl ?? null, detail: `${quantity} exemplaires` }} inCollection inWishlist={false} returnTo="/collection/statistiques#multiples" />)}</div> : <p className="muted-copy">Aucun multiple enregistré actuellement.</p>}</section>
  </div>;
}
