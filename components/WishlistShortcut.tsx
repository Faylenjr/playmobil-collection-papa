"use client";

import { useCollectorOptimisticState } from "./useCollectorOptimisticState";

export function WishlistShortcut({ variantId, inCollection, inWishlist }: { variantId: string; inCollection: boolean; inWishlist: boolean }) {
  const { state, pending, message, mutate } = useCollectorOptimisticState(variantId, { inCollection, inWishlist });
  if (state.inCollection) return <span className="discovery-status owned">✓ Possédé</span>;
  return <div className="wishlist-shortcut">
    <button type="button" disabled={pending} className={state.inWishlist ? "is-wanted" : ""} onClick={() => mutate(state.inWishlist ? "REMOVE_WISHLIST" : "ADD_WISHLIST")}>{state.inWishlist ? "♥ Recherché · Retirer" : "♡ Ajouter à Mes recherches"}</button>
    {message && <small className={message.startsWith("Impossible") ? "optimistic-feedback error" : "optimistic-feedback"} role="status">{message}</small>}
  </div>;
}
