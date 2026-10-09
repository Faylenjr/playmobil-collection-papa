import { describe, expect, it } from "vitest";
import { logicalDuplicateGroups, parseTriState, summarizeCollectionQuality } from "../lib/collection-management";

describe("daily collection management", () => {
  it("keeps an unknown boolean distinct from false", () => {
    expect(parseTriState("unknown")).toBeNull();
    expect(parseTriState(null)).toBeNull();
    expect(parseTriState("no")).toBe(false);
    expect(parseTriState("yes")).toBe(true);
  });

  it("reports physical coverage without converting null to no", () => {
    const result = summarizeCollectionQuality([
      { quantity: 1, condition: "UNKNOWN", isComplete: null, hasBox: null, hasInstructions: false, purchaseDate: null, purchasePrice: null, notes: null },
      { quantity: 3, condition: "GOOD", isComplete: true, hasBox: false, hasInstructions: true, purchaseDate: new Date("2026-01-01"), purchasePrice: 12, notes: "Salon" },
    ]);
    expect(result.copies).toBe(4);
    expect(result.box).toEqual({ yes: 0, no: 1, unknown: 1 });
    expect(result.instructions).toEqual({ yes: 1, no: 1, unknown: 0 });
    expect(result.condition).toEqual({ known: 1, unknown: 1 });
  });

  it("flags separate rows for one logical product without merging them", () => {
    expect(logicalDuplicateGroups([{ variantId: "fr", productId: "set" }, { variantId: "de", productId: "set" }, { variantId: "other", productId: "other" }])).toEqual([{ productId: "set", variantIds: ["fr", "de"] }]);
  });
});
