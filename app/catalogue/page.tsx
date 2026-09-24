import Link from "next/link";
import { getCatalogue, getTheme, PAGE_SIZE } from "../../lib/catalogue";
import { getCollectorStatuses } from "../../lib/collector";
import { ProductCard } from "../../components/ProductCard";

type CataloguePageProps = {
  searchParams: Promise<{ q?: string; page?: string; theme?: string }>;
};

export const dynamic = "force-dynamic";

function pageHref(page: number, query: string, theme: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (theme) params.set("theme", theme);
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
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [result, theme] = await Promise.all([getCatalogue(query, page, themeSlug), themeSlug ? getTheme(themeSlug) : null]);
  const currentPage = Math.min(page, result.pages);
  const statuses = await getCollectorStatuses(result.variants.map(({ id }) => id));

  if (page !== currentPage) {
    const { redirect } = await import("next/navigation");
    redirect(pageHref(currentPage, query, themeSlug));
  }

  const first = result.total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const last = Math.min(currentPage * PAGE_SIZE, result.total);

  return (
    <div className="page-shell catalogue-page">
      <section className="catalogue-intro">
        <div>
          <span className="eyebrow">{theme ? `Thème · ${theme.name}` : "Collection Playmobil"}</span>
          <h1>{theme ? `Explorer ${theme.name}` : "Trouver un set, une figurine ou une édition"}</h1>
        </div>
        <p className="catalogue-count">
          <strong>{result.total.toLocaleString("fr-FR")}</strong>
          <span>{query ? "résultats" : "variantes cataloguées"}</span>
        </p>
      </section>

      <form className="search-form" action="/catalogue" method="get" role="search">
        <label htmlFor="catalogue-search">{theme ? `Rechercher dans ${theme.name}` : "Rechercher dans le catalogue"}</label>
        {themeSlug && <input type="hidden" name="theme" value={themeSlug} />}
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
          {(query || themeSlug) && <Link className="clear-search" href={themeSlug ? `/catalogue?theme=${encodeURIComponent(themeSlug)}` : "/catalogue"}>{query ? "Effacer la recherche" : ""}</Link>}
          {themeSlug && <Link className="clear-search" href="/themes">Changer de thème</Link>}
        </div>
      </form>

      {result.variants.length > 0 ? (
        <>
          <div className="results-bar">
            <span>{first.toLocaleString("fr-FR")}–{last.toLocaleString("fr-FR")} sur {result.total.toLocaleString("fr-FR")}</span>
            <span>Page {currentPage} sur {result.pages}</span>
          </div>

          <section className="catalogue-grid" aria-label="Produits du catalogue">
            {result.variants.map((variant) => {
              const name = variant.name ?? variant.product.name ?? "Nom non renseigné";
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
              {currentPage > 1 ? <Link href={pageHref(currentPage - 1, query, themeSlug)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}
              <div>
                {paginationWindow(currentPage, result.pages).map((value, index, values) => (
                  <span key={value} className="page-number-wrap">
                    {index > 0 && value - values[index - 1]! > 1 && <i>…</i>}
                    <Link className={value === currentPage ? "active" : ""} aria-current={value === currentPage ? "page" : undefined} href={pageHref(value, query, themeSlug)}>{value}</Link>
                  </span>
                ))}
              </div>
              {currentPage < result.pages ? <Link href={pageHref(currentPage + 1, query, themeSlug)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}
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
