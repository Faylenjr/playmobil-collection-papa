import { ProductCard } from "../../components/ProductCard";
import { getLatestReleases } from "../../lib/catalogue";
import { getCollectorStatuses } from "../../lib/collector";

export const dynamic = "force-dynamic";

export default async function LatestReleasesPage() {
  const groups = await getLatestReleases();
  const ids = groups.flatMap(({ items }) => items.map(({ id }) => id));
  const statuses = await getCollectorStatuses(ids);

  return <div className="page-shell listing-page latest-page">
    <section className="page-heading">
      <span className="eyebrow">Chronologie du catalogue</span>
      <h1>Dernières sorties</h1>
      <p>Les dates exactes sont utilisées lorsqu’elles sont connues. Sinon, seule l’année documentée est affichée.</p>
    </section>
    {groups.map(({ year, items }) => <section className="release-year" key={year}>
      <div className="section-title"><h2>{year}</h2><span>{items.length.toLocaleString("fr-FR")} références affichées</span></div>
      <div className="catalogue-grid">
        {items.map((variant) => {
          const status = statuses.get(variant.id)!;
          return <ProductCard
            key={variant.id}
            data={{
              id: variant.id,
              name: variant.displayName,
              reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey,
              year: variant.releaseYear ?? variant.product.releaseYear,
              theme: variant.themes[0]?.theme.name ?? null,
              market: variant.markets.map(({ market }) => market.code).join(" · "),
              variantLabel: variant.variantLabel,
              imageUrl: variant.media[0]?.sourceUrl ?? null,
            }}
            inCollection={status.inCollection}
            inWishlist={status.inWishlist}
            quantity={status.quantity}
          />;
        })}
      </div>
    </section>)}
  </div>;
}
