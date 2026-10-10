import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ProductCard } from "../../../components/ProductCard";
import { PageJump } from "../../../components/PageJump";
import { getCollectionItems, getCollectionRangeOptions, type CollectionFilters } from "../../../lib/collector";
import { getCollectionInsights, getProductRanges } from "../../../lib/collector-insights";
import { getCollectorCategories } from "../../../lib/discovery";
import { getThemes } from "../../../lib/catalogue";
import { getFrenchNames, getPreferredDisplayName } from "../../../lib/display-name";
import { getFrenchThemeName } from "../../../lib/theme-names";
import { buildInternalUrl, type SearchParamRecord } from "../../../lib/navigation-context";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<SearchParamRecord> };

export default async function CollectionShowcasePage({ searchParams }: Props) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const theme = single(params.theme).trim();
  const range = single(params.range).trim();
  const year = Number.parseInt(single(params.year), 10) || undefined;
  const page = Math.max(1, Number.parseInt(single(params.page) || "1", 10) || 1);
  const filters: CollectionFilters = { theme, range, year };
  const [stats, productRanges, categories, themes, ranges, result] = await Promise.all([
    getCollectionInsights(), getProductRanges(), getCollectorCategories(), getThemes(40), getCollectionRangeOptions(), getCollectionItems(filters, "recent", page),
  ]);
  if (page > result.pages) redirect(buildInternalUrl("/collection/vitrine", params, { page: result.pages > 1 ? result.pages : null }));
  const frenchNames = await getFrenchNames(result.items.map(({ variant }) => variant.id));
  const xxl = categories.find((category) => category.slug === "geants-xxl");
  const reliableRanges = productRanges.filter((item) => item.total > 1 && item.owned > 0).sort((a, b) => {
    const left = a.owned / a.total; const right = b.owned / b.total;
    return right - left || b.owned - a.owned;
  });
  const nearlyComplete = reliableRanges.filter((item) => item.missing > 0 && item.missing <= 3 && item.owned / item.total >= .6).slice(0, 6);
  const returnTo = buildInternalUrl("/collection/vitrine", params, { page: page > 1 ? page : null });
  const pageHref = (target: number) => buildInternalUrl("/collection/vitrine", params, { page: target > 1 ? target : null });
  return <div className="page-shell listing-page showcase-page">
    <Link href="/collection" className="back-link">← Ma collection</Link>
    <section className="showcase-hero"><div><span className="eyebrow">Vitrine numérique</span><h1>Ma collection Playmobil</h1><p>Une vue faite pour regarder la collection, explorer ses univers et voir les séries à compléter.</p></div><div className="showcase-totals"><strong>{stats.totalCopies}<small>exemplaires</small></strong><strong>{stats.distinctProducts}<small>produits différents</small></strong><strong>{stats.wishlist}<small>recherchés</small></strong></div></section>
    <section className="section-title"><div><span className="eyebrow">Univers favoris</span><h2>Mes thèmes principaux</h2><p>Comptés par produit logique possédé, sans gonfler les variantes techniques.</p></div><Link href="/themes">Tous les thèmes →</Link></section>
    <section className="showcase-theme-grid">{stats.themes.slice(0, 8).map((item, index) => <Link key={item.slug} href={`/collection/vitrine?theme=${encodeURIComponent(item.slug)}`} style={{ "--rank": index + 1 } as CSSProperties}><span>#{index + 1}</span><strong>{getFrenchThemeName(item)}</strong><small>{item.count} produit{item.count > 1 ? "s" : ""}</small></Link>)}</section>
    <section className="showcase-progress-grid">
      <article><div className="section-title"><div><span className="eyebrow">Progression fiable</span><h2>Gammes presque complètes</h2></div></div>{nearlyComplete.length ? <div className="showcase-range-list">{nearlyComplete.map((item) => { const percent = Math.round(item.owned / item.total * 100); return <Link key={item.slug} href={`/gammes/${item.slug}`}><div><strong>{item.canonicalName}</strong><span>{item.owned} / {item.total} possédés · il manque {item.missing}</span></div><b>{percent} %</b><progress max={item.total} value={item.owned}>{percent} %</progress></Link>; })}</div> : <p className="muted-copy">Aucune gamme structurée n’est encore assez proche d’être complétée.</p>}<small>Uniquement les gammes dont les appartenances sont structurées ; aucun dénominateur n’est inventé.</small></article>
      <article className="xxl-showcase"><span className="eyebrow">Collection transversale</span><h2>Géants / XXL</h2>{xxl ? <><strong>{xxl.owned} / {xxl.total}</strong><progress max={xxl.total || 1} value={xxl.owned}>{xxl.owned} sur {xxl.total}</progress><p>{xxl.wanted} recherché{xxl.wanted > 1 ? "s" : ""}</p><Link className="button" href="/themes/geants-xxl">Voir les Géants / XXL</Link></> : <p>Cette catégorie structurée n’est pas disponible.</p>}</article>
    </section>
    <section className="section-title"><div><span className="eyebrow">Galerie</span><h2>Les objets de ma collection</h2><p>{result.total} références pour cette sélection. Les exemplaires identiques restent regroupés avec leur quantité.</p></div></section>
    <form className="filter-form simple showcase-filters" method="get"><label>Thème<select name="theme" defaultValue={theme}><option value="">Tous les thèmes</option>{themes.map((item) => <option key={item.slug} value={item.slug}>{getFrenchThemeName(item)}</option>)}</select></label><label>Gamme<select name="range" defaultValue={range}><option value="">Toutes les gammes</option>{ranges.map((item) => <option key={item.slug} value={item.slug}>{item.canonicalName}</option>)}</select></label><label>Année<input name="year" type="number" min="1974" max="2100" defaultValue={year ?? ""} placeholder="Toutes" /></label><button type="submit">Afficher</button></form>
    {result.items.length ? <><section className="catalogue-grid showcase-gallery">{result.items.map((item) => { const { variant } = item; return <ProductCard key={item.id} data={{ id: variant.id, name: getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey }), reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection inWishlist={false} quantity={item.quantity} returnTo={returnTo} />; })}</section>{result.pages > 1 && <nav className="pagination simple-pagination" aria-label="Pagination de la vitrine">{page > 1 ? <Link href={pageHref(page - 1)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}<span>Page {page} sur {result.pages}</span>{page < result.pages ? <Link href={pageHref(page + 1)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}</nav>}<PageJump action="/collection/vitrine" currentPage={page} pages={result.pages} params={params} /></> : <p className="empty-state">Aucun objet ne correspond à ces filtres.</p>}
  </div>;
}
