import Link from "next/link";
import { ProductImage } from "./ProductImage";

export type DiscoveryProduct = {
  id: string;
  name: string;
  reference: string;
  year: number | null;
  imageUrl: string | null;
  detail?: string | null;
};

export function DiscoveryProductCard({ product, inCollection, inWishlist, returnTo }: { product: DiscoveryProduct; inCollection: boolean; inWishlist: boolean; returnTo: string }) {
  const href = `/sets/${product.id}?returnTo=${encodeURIComponent(returnTo)}`;
  return <article className={`product-card ${inCollection ? "is-owned" : inWishlist ? "is-wanted" : ""}`}>
    <Link className="card-image" href={href} aria-label={`Voir ${product.name}`}>
      <ProductImage src={product.imageUrl} alt={product.name} />
      {inCollection ? <span className="collector-badge owned-badge">✓ Possédé</span> : inWishlist ? <span className="collector-badge wanted-badge">♡ Recherché</span> : <span className="collector-badge missing-badge">Manquant</span>}
      {product.year && <span className="year-badge">{product.year}</span>}
    </Link>
    <div className="card-body">
      <p className="reference">{product.reference}</p>
      <h2><Link href={href}>{product.name}</Link></h2>
      {product.detail && <div className="card-meta"><span>{product.detail}</span></div>}
    </div>
  </article>;
}
