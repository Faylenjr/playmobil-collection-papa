import { describe, expect, it } from "vitest";
import { commerceRefreshSchedule, prioritizeCommerceTargets } from "../lib/commerce-targeting";

describe("commerce refresh targeting", () => {
  it("refreshes priority wishlist every cycle and spreads lower tiers", () => {
    const base = new Date("2026-10-07T00:00:00Z");
    expect(commerceRefreshSchedule(base, true)).toEqual({ standardWishlist: true, recent: true, collection: true });
    expect(commerceRefreshSchedule(new Date("2026-10-07T06:00:00Z"), true)).toEqual({ standardWishlist: false, recent: false, collection: false });
    expect(commerceRefreshSchedule(new Date("2026-10-07T12:00:00Z"), true)).toEqual({ standardWishlist: true, recent: true, collection: false });
  });

  it("prioritizes wishlist and de-duplicates variants across tiers", () => {
    const schedule = { standardWishlist: true, recent: true, collection: true };
    const selected = prioritizeCommerceTargets({
      WISHLIST_PRIORITY: [{ id: "priority" }],
      WISHLIST_STANDARD: [{ id: "standard" }],
      RECENT_RELEASE: [{ id: "standard" }, { id: "recent" }],
      COLLECTION_ROTATION: [{ id: "priority" }, { id: "collection" }],
    }, schedule, 3);
    expect(selected.map(({ variant, reason }) => [variant.id, reason])).toEqual([
      ["priority", "WISHLIST_PRIORITY"],
      ["standard", "WISHLIST_STANDARD"],
      ["recent", "RECENT_RELEASE"],
    ]);
  });
});
