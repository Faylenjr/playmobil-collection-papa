import Link from "next/link";
import { getCatalogue, getTheme, getThemeNavigation, PAGE_SIZE, parseCatalogueSort, type CatalogueSort } from "../../lib/catalogue";
import { getCollectorStatuses } from "../../lib/collector";
import { ProductCard } from "../../components/ProductCard";

type CataloguePageProps = {
  searchParams: Promise<{ q?: string; page?: string; theme?: string; sort?: string; year?: string }>;
};

export const dynamic = "force-dynamic";

function catalogueHref(page: number, query: string, theme: string, sort: CatalogueSort, year?: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (theme) params.set("theme", theme);
  if (sort !== "recommended") params.set("sort", sort);
  if (year) params.set("year", String(year));
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/catalogue?${suffix}` : "/catalogue";
}

function paginationWindow(current: number, total: number) {
  const values = new Set([1, total, current - 1, current, current + 1]);
  return [...values].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);
}

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const themeSlug = (params.theme ?? "").trim();
  const sort = parseCatalogueSort(params.sort);
  const parsedYear = Number.parseInt(params.year ?? "", 10);
  const year = Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [result, theme, themeNavigation] = await Promise.all([
    getCatalogue(query, page, themeSlug, sort, year),
    themeSlug ? getTheme(themeSlug) : null,
    themeSlug ? getThemeNavigation(themeSlug) : null,
  ]);
  const currentPage = Math.min(page, result.pages);
  const statuses = await getCollectorStatuses(result.variants.map(({ id }) => id));

  if (page !== currentPage) {
    const { redirect } = await import("next/navigation");
    redirect(catalogueHref(currentPage, query, themeSlug, sort, year));
  }

  const first = result.total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const last = Math.min(currentPage * PAGE_SIZE, result.total);

  return (
    <div className="page-shell catalogue-page">
      <section className="catalogue-intro">
        <div>
          <span className="eyebrow">{theme ? `Thème · ${theme.name}` : "Collection Playmobil"}</span>
          <h1>{theme ? `Explorer ${theme.name}` : "Trouver un set, une figurine ou une édition"}</h1>
          {year && <p className="active-filter">Sorties de {year}</p>}
        </div>
        <p className="catalogue-count">
          <strong>{result.total.toLocaleString("fr-FR")}</strong>
          <span>{query ? "résultats" : "variantes cataloguées"}</span>
        </p>
      </section>

      <form className="search-form" action="/catalogue" method="get" role="search">
        <label htmlFor="catalogue-search">{theme ? `Rechercher dans ${theme.name}` : "Rechercher dans le catalogue"}</label>
        {themeSlug && <input type="hidden" name="theme" value={themeSlug} />}
        {year && <input type="hidden" name="year" value={year} />}
        <div className="search-row">
          <input
            id="catalogue-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Référence, nom ou variante…"
            autoComplete="off"
          />
          <button type="submit">Rechercher</button>
          <label className="sort-control">Trier par
            <select name="sort" defaultValue={sort}>
              <option value="recommended">Recommandé pour collectionneur</option>
              <option value="newest">Plus récent</option>
              <option value="oldest">Plus ancien</option>
              <option value="reference">Référence</option>
            </select>
          </label>
          {query && <Link className="clear-search" href={catalogueHref(1, "", themeSlug, sort, year)}>Effacer la recherche</Link>}
          {themeSlug && <Link className="clear-search" href="/themes">Changer de thème</Link>}
        </div>
      </form>

      {theme && themeNavigation && (themeNavigation.children.length > 0 || themeNavigation.years.length > 0) && (
        <section className="theme-navigation" aria-label={`Explorer ${theme.name}`}>
          {themeNavigation.children.length > 0 && <div>
            <h2>Sous-thèmes</h2>
            <div className="filter-chips">{themeNavigation.children.map((child) => <Link key={child.slug} href={catalogueHref(1, "", child.slug, sort)}>{child.name}<span>{child.count.toLocaleString("fr-FR")}</span></Link>)}</div>
          </div>}
          {themeNavigation.years.length > 0 && <div>
            <h2>Par année</h2>
            <div className="filter-chips years">{themeNavigation.years.map((item) => <Link className={year === item.year ? "active" : ""} key={item.year} href={catalogueHref(1, query, themeSlug, sort, item.year)}>{item.year}<span>{item.count.toLocaleString("fr-FR")}</span></Link>)}</div>
            {year && <Link className="clear-filter" href={catalogueHref(1, query, themeSlug, sort)}>Toutes les années</Link>}
          </div>}
        </section>
      )}

      {result.variants.length > 0 ? (
        <>
          <div className="results-bar">
            <span>{first.toLocaleString("fr-FR")}–{last.toLocaleString("fr-FR")} sur {result.total.toLocaleString("fr-FR")}</span>
            <span>Page {currentPage} sur {result.pages}</span>
          </div>

          <section className="catalogue-grid" aria-label="Produits du catalogue">
            {result.variants.map((variant) => {
              const name = variant.displayName;
              const reference = variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey;
              const year = variant.releaseYear ?? variant.product.releaseYear;
              const theme = variant.themes[0]?.theme.name;
              const market = variant.markets.map(({ market: item }) => item.code).join(" · ");

              const status = statuses.get(variant.id)!;
              return <ProductCard key={variant.id} data={{ id: variant.id, name, reference, year: year ?? null, theme: theme ?? null, market, variantLabel: variant.variantLabel, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection={status.inCollection} inWishlist={status.inWishlist} quantity={status.quantity} />;
            })}
          </section>

          {result.pages > 1 && (
            <nav className="pagination" aria-label="Pagination du catalogue">
              {currentPage > 1 ? <Link href={catalogueHref(currentPage - 1, query, themeSlug, sort, year)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}
              <div>
                {paginationWindow(currentPage, result.pages).map((value, index, values) => (
                  <span key={value} className="page-number-wrap">
                    {index > 0 && value - values[index - 1]! > 1 && <i>…</i>}
                    <Link className={value === currentPage ? "active" : ""} aria-current={value === currentPage ? "page" : undefined} href={catalogueHref(value, query, themeSlug, sort, year)}>{value}</Link>
                  </span>
                ))}
              </div>
              {currentPage < result.pages ? <Link href={catalogueHref(currentPage + 1, query, themeSlug, sort, year)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}
            </nav>
          )}
        </>
      ) : (
        <section className="empty-state">
          <span aria-hidden="true">⌕</span>
          <h2>Aucun résultat</h2>
          <p>Aucune fiche ne correspond à « {query} ».</p>
          <Link className="button" href="/catalogue">Voir tout le catalogue</Link>
        </section>
      )}
    </div>
  );
}
