import { describe, expect, it } from "vitest";
import { applyCollectorUiAction } from "../lib/collector-ui-state";

describe("collector optimistic UI state", () => {
  it("reflects collection and wishlist actions immediately", () => {
    expect(applyCollectorUiAction({ inCollection: false, inWishlist: false }, "ADD_WISHLIST")).toEqual({ inCollection: false, inWishlist: true });
    expect(applyCollectorUiAction({ inCollection: false, inWishlist: true }, "REMOVE_WISHLIST")).toEqual({ inCollection: false, inWishlist: false });
    expect(applyCollectorUiAction({ inCollection: false, inWishlist: true }, "ADD_COLLECTION")).toEqual({ inCollection: true, inWishlist: true });
  });

  it("does not wishlist an already owned object", () => {
    expect(applyCollectorUiAction({ inCollection: true, inWishlist: false }, "ADD_WISHLIST")).toEqual({ inCollection: true, inWishlist: false });
  });
});
