import Link from "next/link";
import { ProductCard } from "../../components/ProductCard";
import { getCollectionItems } from "../../lib/collector";
import { getThemes } from "../../lib/catalogue";
import { getFrenchNames, getPreferredDisplayName } from "../../lib/display-name";

type Props = { searchParams: Promise<{ q?: string; theme?: string; sort?: string; page?: string }> };
export const dynamic = "force-dynamic";

export default async function CollectionPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const theme = (params.theme ?? "").trim();
  const sort = (params.sort ?? "recent").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [result, themes] = await Promise.all([getCollectionItems(query, theme, sort, page), getThemes(40)]);
  const frenchNames = await getFrenchNames(result.items.map(({ variant }) => variant.id));
  const pageHref = (target: number) => { const search = new URLSearchParams(); if (query) search.set("q", query); if (theme) search.set("theme", theme); if (sort !== "recent") search.set("sort", sort); if (target > 1) search.set("page", String(target)); return `/collection${search.size ? `?${search}` : ""}`; };
  return (
    <div className="page-shell listing-page">
      <section className="page-heading"><span className="eyebrow">Mon inventaire</span><h1>Ma collection</h1><p>{result.total.toLocaleString("fr-FR")} objet{result.total > 1 ? "s" : ""}</p></section>
      <form className="filter-form" method="get">
        <label>Rechercher<input name="q" type="search" defaultValue={query} placeholder="Nom ou référence…" /></label>
        <label>Thème<select name="theme" defaultValue={theme}><option value="">Tous les thèmes</option>{themes.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
        <label>Trier<select name="sort" defaultValue={sort}><option value="recent">Année récente</option><option value="oldest">Année ancienne</option><option value="quantity">Quantité</option></select></label>
        <button type="submit">Appliquer</button>
      </form>
      {result.items.length ? <><section className="catalogue-grid" aria-label="Objets de ma collection">{result.items.map(({ variant, quantity }) => {
        const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
        return <ProductCard key={variant.id} data={{ id: variant.id, name, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection inWishlist={false} quantity={quantity} />;
      })}</section>{result.pages > 1 && <nav className="pagination simple-pagination" aria-label="Pagination de la collection">{page > 1 ? <Link href={pageHref(page - 1)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}<span>Page {page} sur {result.pages}</span>{page < result.pages ? <Link href={pageHref(page + 1)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}</nav>}</> : <section className="empty-state"><h2>Votre collection est vide</h2><p>Ajoutez vos premiers objets depuis le catalogue.</p><Link className="button" href="/catalogue">Explorer le catalogue</Link></section>}
    </div>
  );
}
