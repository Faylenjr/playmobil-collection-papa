import { ProductCard } from "./ProductCard";
import { QuickCollectionEditor } from "./QuickCollectionEditor";

type Props = {
  item: {
    id: string;
    quantity: number;
    condition: string;
    isComplete: boolean | null;
    hasBox: boolean | null;
    hasInstructions: boolean | null;
    purchaseDate: Date | null;
    purchasePrice: unknown;
    currency: string | null;
    notes: string | null;
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
    {selectable && <label className="bulk-select"><input form="bulk-collection-form" type="checkbox" name="itemIds" value={item.id} /><span>Sélectionner</span></label>}
    <ProductCard data={{ id: variant.id, name, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection inWishlist={false} quantity={item.quantity} returnTo={returnTo} />
    <QuickCollectionEditor variantId={variant.id} item={{ ...item, purchaseDate: item.purchaseDate?.toISOString() ?? null, purchasePrice: item.purchasePrice === null || item.purchasePrice === undefined ? null : String(item.purchasePrice) }} open={openEditor} />
  </div>;
}
