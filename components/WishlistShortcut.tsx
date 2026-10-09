import { addToWishlist } from "../app/actions/collector";

export function WishlistShortcut({ variantId, inCollection, inWishlist }: { variantId: string; inCollection: boolean; inWishlist: boolean }) {
  if (inCollection) return <span className="discovery-status owned">✓ Possédé</span>;
  if (inWishlist) return <span className="discovery-status wanted">♥ Recherché</span>;
  return <form action={addToWishlist.bind(null, variantId)} className="wishlist-shortcut"><button type="submit">♡ Ajouter à Mes recherches</button></form>;
}
