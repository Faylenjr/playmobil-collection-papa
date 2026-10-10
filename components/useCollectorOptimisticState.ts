"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToCollection, addToWishlist, removeFromWishlist } from "../app/actions/collector";
import { applyCollectorUiAction, type CollectorUiAction, type CollectorUiState } from "../lib/collector-ui-state";

const EVENT_NAME = "collector-state-change";

export function useCollectorOptimisticState(variantId: string, initial: CollectorUiState) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => setState(initial), [initial.inCollection, initial.inWishlist]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ variantId: string; state: CollectorUiState }>).detail;
      if (detail?.variantId === variantId) setState(detail.state);
    };
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, [variantId]);

  const mutate = (action: CollectorUiAction) => {
    if (pending) return;
    const previous = state;
    const optimistic = applyCollectorUiAction(state, action);
    setState(optimistic);
    setMessage("");
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { variantId, state: optimistic } }));
    startTransition(async () => {
      const result = action === "ADD_COLLECTION"
        ? await addToCollection(variantId)
        : action === "ADD_WISHLIST"
          ? await addToWishlist(variantId)
          : await removeFromWishlist(variantId);
      if (!result.ok) {
        setState(previous);
        setMessage(result.message);
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { variantId, state: previous } }));
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  };

  return { state, pending, message, mutate };
}
