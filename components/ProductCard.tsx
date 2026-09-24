import Link from "next/link";
import { ProductImage } from "./ProductImage";
import { CollectionControls } from "./CollectionControls";

export type ProductCardData = {
  id: string;
  name: string;
  reference: string;
  year: number | null;
  theme?: string | null;
  market?: string | null;
  variantLabel?: string | null;
  imageUrl?: string | null;
};

export function ProductCard({ data, inCollection, inWishlist, quantity }: { data: ProductCardData; inCollection: boolean; inWishlist: boolean; quantity?: number }) {
  return (
    <article className="product-card">
      <Link href={`/sets/${data.id}`} className="card-image" aria-label={`Voir ${data.name}`}>
        <ProductImage src={data.imageUrl ?? null} alt={data.name} />
        {data.year && <span className="year-badge">{data.year}</span>}
        {quantity && quantity > 1 ? <span className="quantity-badge">× {quantity}</span> : null}
      </Link>
      <div className="card-body">
        <p className="reference">{data.reference}</p>
        <h2><Link href={`/sets/${data.id}`}>{data.name}</Link></h2>
        <div className="card-meta">
          {data.theme && <span>{data.theme}</span>}
          {data.market && <span>{data.market}</span>}
          {data.variantLabel && <span>{data.variantLabel}</span>}
        </div>
        <CollectionControls variantId={data.id} inCollection={inCollection} inWishlist={inWishlist} compact />
      </div>
    </article>
  );
}
