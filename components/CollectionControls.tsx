import { addToCollection, addToWishlist, removeFromCollection, removeFromWishlist } from "../app/actions/collector";

type Props = { variantId: string; inCollection: boolean; inWishlist: boolean; compact?: boolean };

export function CollectionControls({ variantId, inCollection, inWishlist, compact = false }: Props) {
  const addCollection = addToCollection.bind(null, variantId);
  const removeCollection = removeFromCollection.bind(null, variantId);
  const addWishlist = addToWishlist.bind(null, variantId);
  const removeWishlist = removeFromWishlist.bind(null, variantId);
  return (
    <div className={`collection-controls ${compact ? "compact" : ""}`}>
      {inCollection ? (
        <form action={removeCollection}><button className="status-button owned" type="submit">✓ Dans ma collection <span>Retirer</span></button></form>
      ) : (
        <form action={addCollection}><button className="status-button add" type="submit">+ Ajouter à ma collection</button></form>
      )}
      {!inCollection && (inWishlist ? (
        <form action={removeWishlist}><button className="status-button wanted" type="submit">♡ Je recherche <span>Retirer</span></button></form>
      ) : (
        <form action={addWishlist}><button className="status-button wishlist" type="submit">♡ Je recherche</button></form>
      ))}
    </div>
  );
}
