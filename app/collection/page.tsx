import Link from "next/link";
import { CollectionManagedCard } from "../../components/CollectionManagedCard";
import { BulkCollectionForm } from "../../components/BulkCollectionForm";
import { getCollectionItems, getCollectionRangeOptions, type CollectionFilters } from "../../lib/collector";
import { getThemes } from "../../lib/catalogue";
import { getFrenchNames, getPreferredDisplayName } from "../../lib/display-name";
import { PageJump } from "../../components/PageJump";
import { buildInternalUrl, type SearchParamRecord } from "../../lib/navigation-context";
import { redirect } from "next/navigation";

type Props = { searchParams: Promise<SearchParamRecord> };
export const dynamic = "force-dynamic";

export default async function CollectionPage({ searchParams }: Props) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const query = single(params.q).trim();
  const theme = single(params.theme).trim();
  const range = single(params.range).trim();
  const year = Number.parseInt(single(params.year), 10) || undefined;
  const sort = (single(params.sort) || "recent").trim();
  const tri = (name: string) => { const value = single(params[name]); return value === "yes" || value === "no" || value === "unknown" ? value : undefined; };
  const filters: CollectionFilters = { query, theme, range, year, condition: single(params.condition) || undefined, complete: tri("complete"), box: tri("box"), instructions: tri("instructions"), multiple: single(params.multiple) === "yes" };
  const page = Math.max(1, Number.parseInt(single(params.page) || "1", 10) || 1);
  const [result, themes, ranges] = await Promise.all([getCollectionItems(filters, sort, page), getThemes(40), getCollectionRangeOptions()]);
  if (page > result.pages) redirect(buildInternalUrl("/collection", params, { page: result.pages > 1 ? result.pages : null }));
  const frenchNames = await getFrenchNames(result.items.map(({ variant }) => variant.id));
  const returnTo = buildInternalUrl("/collection", params, { page: page > 1 ? page : null });
  const pageHref = (target: number) => buildInternalUrl("/collection", params, { page: target > 1 ? target : null });
  return (
    <div className="page-shell listing-page">
      <section className="page-heading collector-page-heading collection-heading"><div><span className="eyebrow">Mon inventaire</span><h1>Ma collection</h1><p>Les boîtes et objets que je possède déjà.</p><div className="heading-actions"><Link className="button" href="/collection/ajouter">+ Ajouter rapidement</Link><Link className="button secondary-button" href="/collection/inventaire">Mode inventaire</Link><Link className="inline-collector-link" href="/collection/vitrine">Voir la vitrine</Link><Link className="inline-collector-link" href="/collection/a-renseigner">À renseigner</Link><Link className="inline-collector-link" href="/collection/statistiques">Statistiques et multiples</Link></div></div><strong>{result.total.toLocaleString("fr-FR")}<small>objet{result.total > 1 ? "s" : ""}</small></strong></section>
      <form className="filter-form" method="get">
        <label>Rechercher<input name="q" type="search" defaultValue={query} placeholder="Nom ou référence…" /></label>
        <label>Thème<select name="theme" defaultValue={theme}><option value="">Tous les thèmes</option>{themes.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
        <label>Gamme<select name="range" defaultValue={range}><option value="">Toutes les gammes</option>{ranges.map((item) => <option key={item.slug} value={item.slug}>{item.canonicalName}</option>)}</select></label>
        <label>Année<input name="year" type="number" min="1974" max="2100" defaultValue={year ?? ""} placeholder="Toutes" /></label>
        <label>État<select name="condition" defaultValue={filters.condition ?? ""}><option value="">Tous</option><option value="UNKNOWN">Inconnu</option><option value="SEALED">Sous blister</option><option value="NEW">Neuf</option><option value="EXCELLENT">Excellent</option><option value="GOOD">Bon</option><option value="FAIR">Correct</option><option value="POOR">Usé</option></select></label>
        <label>Complet<select name="complete" defaultValue={filters.complete ?? ""}><option value="">Tous</option><option value="yes">Oui</option><option value="no">Non</option><option value="unknown">Non renseigné</option></select></label>
        <label>Boîte<select name="box" defaultValue={filters.box ?? ""}><option value="">Toutes</option><option value="yes">Oui</option><option value="no">Non</option><option value="unknown">Non renseigné</option></select></label>
        <label>Notice<select name="instructions" defaultValue={filters.instructions ?? ""}><option value="">Toutes</option><option value="yes">Oui</option><option value="no">Non</option><option value="unknown">Non renseigné</option></select></label>
        <label>Multiples<select name="multiple" defaultValue={filters.multiple ? "yes" : ""}><option value="">Tous</option><option value="yes">Quantité supérieure à 1</option></select></label>
        <label>Trier<select name="sort" defaultValue={sort}><option value="recent">Année récente</option><option value="oldest">Année ancienne</option><option value="quantity">Quantité</option></select></label>
        <button type="submit">Appliquer</button>
      </form>
      {result.items.length ? <><BulkCollectionForm /><section className="catalogue-grid collection-management-grid" aria-label="Objets de ma collection">{result.items.map((item) => {
        const { variant } = item;
        const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
        return <CollectionManagedCard key={item.id} item={item} name={name} returnTo={returnTo} />;
      })}</section>{result.pages > 1 && <nav className="pagination simple-pagination" aria-label="Pagination de la collection">{page > 1 ? <Link href={pageHref(page - 1)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}<span>Page {page} sur {result.pages}</span>{page < result.pages ? <Link href={pageHref(page + 1)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}</nav>}<PageJump action="/collection" currentPage={page} pages={result.pages} params={params} /></> : <section className="empty-state collector-empty"><span aria-hidden="true">✓</span><h2>Votre collection est prête</h2><p>Ajoutez une première boîte depuis le catalogue pour commencer votre inventaire.</p><Link className="button" href="/catalogue">Explorer le catalogue</Link></section>}
    </div>
  );
}
