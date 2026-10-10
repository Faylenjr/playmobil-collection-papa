export type CollectorUiState = { inCollection: boolean; inWishlist: boolean };
export type CollectorUiAction = "ADD_COLLECTION" | "ADD_WISHLIST" | "REMOVE_WISHLIST";

export function applyCollectorUiAction(state: CollectorUiState, action: CollectorUiAction): CollectorUiState {
  if (action === "ADD_COLLECTION") return { ...state, inCollection: true };
  if (action === "ADD_WISHLIST" && !state.inCollection) return { ...state, inWishlist: true };
  if (action === "REMOVE_WISHLIST") return { ...state, inWishlist: false };
  return state;
}
