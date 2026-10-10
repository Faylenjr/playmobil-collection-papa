"use client";

import Link from "next/link";
import { useCollectorOptimisticState } from "./useCollectorOptimisticState";

type Props = { variantId: string; inCollection: boolean; inWishlist: boolean; compact?: boolean };

export function CollectionControls({ variantId, inCollection, inWishlist, compact = false }: Props) {
  const { state, pending, message, mutate } = useCollectorOptimisticState(variantId, { inCollection, inWishlist });
  return (
    <div className={`collection-controls ${compact ? "compact" : ""}`}>
      {state.inCollection ? (
        <Link className="status-button owned" href={`/sets/${variantId}#mes-exemplaires`}>✓ Dans ma collection <span>Gérer les exemplaires</span></Link>
      ) : (
        <button className="status-button add" type="button" disabled={pending} onClick={() => mutate("ADD_COLLECTION")}>+ Ajouter à ma collection</button>
      )}
      {!state.inCollection && (state.inWishlist ? (
        <button className="status-button wanted" type="button" disabled={pending} onClick={() => mutate("REMOVE_WISHLIST")}>♥ Recherché <span>Retirer</span></button>
      ) : (
        <button className="status-button wishlist" type="button" disabled={pending} onClick={() => mutate("ADD_WISHLIST")}>♡ Je recherche</button>
      ))}
      {message && <small className={message.startsWith("Impossible") ? "optimistic-feedback error" : "optimistic-feedback"} role="status">{message}</small>}
    </div>
  );
}
