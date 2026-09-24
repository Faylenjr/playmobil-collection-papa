import Link from "next/link";
import { getCatalogue, PAGE_SIZE } from "../../lib/catalogue";
import { ProductImage } from "../../components/ProductImage";

type CataloguePageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export const dynamic = "force-dynamic";

function pageHref(page: number, query: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
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
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await getCatalogue(query, page);
  const currentPage = Math.min(page, result.pages);

  if (page !== currentPage) {
    const { redirect } = await import("next/navigation");
    redirect(pageHref(currentPage, query));
  }

  const first = result.total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const last = Math.min(currentPage * PAGE_SIZE, result.total);

  return (
    <div className="page-shell catalogue-page">
      <section className="catalogue-intro">
        <div>
          <span className="eyebrow">Collection Playmobil</span>
          <h1>Trouver un set, une figurine ou une édition</h1>
        </div>
        <p className="catalogue-count">
          <strong>{result.total.toLocaleString("fr-FR")}</strong>
          <span>{query ? "résultats" : "variantes cataloguées"}</span>
        </p>
      </section>

      <form className="search-form" action="/catalogue" method="get" role="search">
        <label htmlFor="catalogue-search">Rechercher dans le catalogue</label>
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
          {query && <Link className="clear-search" href="/catalogue">Effacer</Link>}
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

              return (
                <article className="product-card" key={variant.id}>
                  <Link href={`/sets/${variant.id}`} className="card-image" aria-label={`Voir ${name}`}>
                    <ProductImage src={variant.media[0]?.sourceUrl ?? null} alt={name} />
                    {year && <span className="year-badge">{year}</span>}
                  </Link>
                  <div className="card-body">
                    <p className="reference">{reference}</p>
                    <h2><Link href={`/sets/${variant.id}`}>{name}</Link></h2>
                    <div className="card-meta">
                      {theme && <span>{theme}</span>}
                      {market && <span>{market}</span>}
                      {variant.variantLabel && <span>{variant.variantLabel}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {result.pages > 1 && (
            <nav className="pagination" aria-label="Pagination du catalogue">
              {currentPage > 1 ? <Link href={pageHref(currentPage - 1, query)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}
              <div>
                {paginationWindow(currentPage, result.pages).map((value, index, values) => (
                  <span key={value} className="page-number-wrap">
                    {index > 0 && value - values[index - 1]! > 1 && <i>…</i>}
                    <Link className={value === currentPage ? "active" : ""} aria-current={value === currentPage ? "page" : undefined} href={pageHref(value, query)}>{value}</Link>
                  </span>
                ))}
              </div>
              {currentPage < result.pages ? <Link href={pageHref(currentPage + 1, query)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}
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
