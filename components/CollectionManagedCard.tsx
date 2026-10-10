import { ProductCard } from "./ProductCard";
import { QuickCollectionEditor } from "./QuickCollectionEditor";
import { DeleteCollectionCopyButton } from "./DeleteCollectionCopyButton";
import { copyLabel } from "../lib/collection-management";

type Props = {
  item: {
    id: string;
    quantity: number;
    copies: Array<{ id: string; condition: string; isComplete: boolean | null; hasBox: boolean | null; hasInstructions: boolean | null; purchaseDate: Date | null; purchasePrice: unknown; currency: string | null; notes: string | null }>;
    variant: {
      id: string;
      releaseYear: number | null;
      canonicalKey: string;
      product: { name: string | null; baseReference: string | null; releaseYear: number | null };
      references: Array<{ displayValue: string }>;
      themes: Array<{ theme: { name: string } }>;
      media: Array<{ sourceUrl: string }>;
    };
  };
  name: string;
  returnTo: string;
  selectable?: boolean;
  openEditor?: boolean;
};

export function CollectionManagedCard({ item, name, returnTo, selectable = true, openEditor = false }: Props) {
  const variant = item.variant;
  return <div className="collection-managed-card">
    <ProductCard data={{ id: variant.id, name, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection inWishlist={false} quantity={item.quantity} returnTo={returnTo} />
    <details className="copy-list" open={openEditor || item.copies.length > 1}>
      <summary>{item.copies.length > 1 ? `Voir les ${item.copies.length} exemplaires` : "Gérer mon exemplaire"}</summary>
      {item.copies.map((copy, index) => <section className="copy-card" key={copy.id}>
        <div className="copy-card-heading"><strong>{copyLabel(index, item.copies.length)}</strong>{selectable && <label className="bulk-select"><input form="bulk-collection-form" type="checkbox" name="copyIds" value={copy.id} /><span>Sélectionner cet exemplaire</span></label>}</div>
        <QuickCollectionEditor variantId={variant.id} copyId={copy.id} item={{ ...copy, purchaseDate: copy.purchaseDate?.toISOString() ?? null, purchasePrice: copy.purchasePrice === null || copy.purchasePrice === undefined ? null : String(copy.purchasePrice) }} open={item.copies.length === 1 && openEditor} />
        <DeleteCollectionCopyButton copyId={copy.id} isLast={item.copies.length === 1} />
      </section>)}
      <QuickCollectionEditor variantId={variant.id} addMode />
    </details>
  </div>;
}
