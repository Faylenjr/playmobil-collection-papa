import Link from "next/link";
import { DiscoveryProductCard } from "../../../components/DiscoveryProductCard";
import { getCollectionInsights } from "../../../lib/collector-insights";
import { getCollectionQualitySummary } from "../../../lib/collector";
import { getFrenchThemeName } from "../../../lib/theme-names";

export const dynamic = "force-dynamic";

export default async function CollectionStatsPage() {
  const [stats, quality] = await Promise.all([getCollectionInsights(), getCollectionQualitySummary()]);
  const knownYears = stats.years.reduce((sum, item) => sum + item.count, 0);
  return <div className="page-shell listing-page collection-stats-page">
    <Link href="/collection" className="back-link">← Ma collection</Link>
    <section className="page-heading themes-heading"><span className="eyebrow">Vue d’ensemble</span><h1>Statistiques de ma collection</h1><p>Des repères utiles basés uniquement sur les données connues. Les années inconnues ne sont pas intégrées à la chronologie.</p></section>
    <section className="collector-kpis" aria-label="Résumé de la collection"><article><strong>{stats.totalCopies}</strong><span>exemplaires</span></article><article><strong>{stats.distinctVariants}</strong><span>références/variantes</span></article><article><strong>{stats.distinctProducts}</strong><span>produits distincts</span></article><article><strong>{stats.wishlist}</strong><span>recherchés</span></article></section>
    <section className="section-title"><div><span className="eyebrow">Informations physiques</span><h2>Qualité de mon inventaire</h2><p>“Inconnu” signifie que l’information n’a pas encore été saisie, jamais “non”.</p></div><Link href="/collection/a-renseigner">Compléter les fiches →</Link></section>
    <section className="physical-stats-grid">
      <Link href="/collection?condition=UNKNOWN"><strong>{quality.condition.unknown}</strong><span>états inconnus</span><small>{quality.condition.known} renseignés</small></Link>
      <Link href="/collection/a-renseigner?field=complete"><strong>{quality.complete.unknown}</strong><span>complétudes inconnues</span><small>{quality.complete.yes} complets · {quality.complete.no} incomplets</small></Link>
      <Link href="/collection/a-renseigner?field=box"><strong>{quality.box.unknown}</strong><span>boîtes non renseignées</span><small>{quality.box.yes} oui · {quality.box.no} non</small></Link>
      <Link href="/collection/a-renseigner?field=instructions"><strong>{quality.instructions.unknown}</strong><span>notices non renseignées</span><small>{quality.instructions.yes} oui · {quality.instructions.no} non</small></Link>
      <Link href="/collection/a-renseigner?field=purchaseDate"><strong>{quality.purchaseDate.unknown}</strong><span>dates inconnues</span><small>{quality.purchaseDate.known} renseignées</small></Link>
      <Link href="/collection/a-renseigner?field=purchasePrice"><strong>{quality.purchasePrice.unknown}</strong><span>prix inconnus</span><small>{quality.purchasePrice.known} renseignés</small></Link>
    </section>
    <section className="insight-columns">
      <article className="insight-panel"><div className="section-title"><div><span className="eyebrow">Univers représentés</span><h2>Mes thèmes principaux</h2></div></div><ol className="insight-list">{stats.themes.slice(0, 12).map((theme) => <li key={theme.slug}><Link href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`}>{getFrenchThemeName(theme)}</Link><strong>{theme.count} produit{theme.count > 1 ? "s" : ""}</strong></li>)}</ol><small>Comptage par produit distinct possédé, parmi les rattachements de thème documentés.</small></article>
      <article className="insight-panel"><div className="section-title"><div><span className="eyebrow">Chronologie fiable</span><h2>Mes produits par année</h2></div></div><div className="year-cloud">{stats.years.map((item) => <Link href={`/catalogue?year=${item.year}`} key={item.year}><strong>{item.year}</strong><span>{item.count} possédés</span></Link>)}</div><small>{knownYears} produits possédés ont une année exploitable. Aucun taux de complétion historique n’est inventé.</small></article>
    </section>
    <section className="latest-section" id="multiples"><div className="section-title"><div><span className="eyebrow">Échanges et doubles</span><h2>Mes multiples</h2><p>Une quantité supérieure à 1 est volontairement conservée et n’est jamais traitée comme une erreur.</p></div><strong>{stats.multiples.length} référence{stats.multiples.length > 1 ? "s" : ""}</strong></div>{stats.multiples.length ? <div className="catalogue-grid">{stats.multiples.map(({ variant, quantity }) => <DiscoveryProductCard key={variant.id} product={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, imageUrl: variant.media[0]?.sourceUrl ?? null, detail: `${quantity} exemplaires` }} inCollection inWishlist={false} returnTo="/collection/statistiques#multiples" />)}</div> : <p className="muted-copy">Aucun multiple enregistré actuellement.</p>}</section>
    <section className="latest-section"><div className="section-title"><div><span className="eyebrow">Revue prudente</span><h2>Potentiels doublons de saisie</h2><p>Plusieurs lignes peuvent être légitimes si elles représentent des éditions ou des états physiques différents. Rien n’est fusionné automatiquement.</p></div><strong>{stats.potentialDuplicateGroups.length} groupe{stats.potentialDuplicateGroups.length > 1 ? "s" : ""}</strong></div>{stats.potentialDuplicateGroups.length ? <div className="duplicate-review-list">{stats.potentialDuplicateGroups.map((group) => <article key={group.productId}><strong>{group.variants[0]?.product.baseReference ?? group.variants[0]?.product.name ?? "Produit"}</strong><span>{group.variants.length} lignes : {group.variants.map((variant) => variant.references[0]?.displayValue ?? variant.canonicalKey).join(", ")}</span><small>À vérifier manuellement — aucune fusion proposée.</small></article>)}</div> : <p className="muted-copy">Aucun doublon potentiel détecté.</p>}</section>
  </div>;
}
