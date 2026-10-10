"use client";

import { useCollectorOptimisticState } from "./useCollectorOptimisticState";

export function WishlistPurchaseActions({ variantId, owned }: { variantId: string; owned: boolean }) {
  const { state, pending, message, mutate } = useCollectorOptimisticState(variantId, { inCollection: owned, inWishlist: true });
  return <div className="wishlist-purchase-actions">
    {state.inCollection ? <div className="wishlist-purchase-confirm"><strong>✓ Ajouté à la collection.</strong><span>Retirer également de Mes recherches ?</span><button className="primary-action" type="button" disabled={pending} onClick={() => mutate("REMOVE_WISHLIST")}>Oui, retirer</button><small>Sinon, laissez-le ici.</small></div> : <button className="primary-action" type="button" disabled={pending} onClick={() => mutate("ADD_COLLECTION")}>Ajouter à ma collection</button>}
    {!state.inCollection && state.inWishlist && <button className="text-action" type="button" disabled={pending} onClick={() => mutate("REMOVE_WISHLIST")}>Retirer de mes recherches</button>}
    {message && <small className={message.startsWith("Impossible") ? "optimistic-feedback error" : "optimistic-feedback"} role="status">{message}</small>}
  </div>;
}
