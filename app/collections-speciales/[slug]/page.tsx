import { notFound } from "next/navigation";
import { ProductCard } from "../../../components/ProductCard";
import { getCollectorCategory } from "../../../lib/discovery";

export const dynamic = "force-dynamic";

export default async function SpecialCollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const category = await getCollectorCategory(slug);
  if (!category) notFound();
  const returnTo = `/collections-speciales/${slug}`;
  return <div className="page-shell listing-page">
    <section className="page-heading collector-page-heading"><div><span className="eyebrow">Collection spéciale</span><h1>{category.name}</h1><p>{category.description}</p><small>Règle vérifiable : format structuré « Decoration toy » + appellation XXL. Les animaux, véhicules, calendriers et sacs simplement nommés “Giant/XXL” sont exclus.</small></div><strong>{category.variants.length}<small>objets</small></strong></section>
    <div className="catalogue-grid discovery-products">
      {category.variants.map((variant) => {
        const status = category.statuses.get(variant.id)!;
        return <ProductCard key={variant.id} data={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, market: variant.markets.map(({ market }) => market.code).join(" · "), variantLabel: variant.variantLabel, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection={status.inCollection} inWishlist={status.inWishlist} quantity={status.quantity} returnTo={returnTo} />;
      })}
    </div>
  </div>;
}
