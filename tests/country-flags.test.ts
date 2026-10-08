import { describe, expect, it } from "vitest";
import { marketDisplayName } from "../lib/country-markets";

describe("country display names", () => {
  it("uses French country names while preserving historic distributor context", () => {
    expect(marketDisplayName("GERMANY", "Germany")).toBe("Allemagne");
    expect(marketDisplayName("ARGENTINA-ANTEX", "argentina-antex")).toBe("Argentine · Antex");
    expect(marketDisplayName("JAPAN-EPOCH", "japan-epoch")).toBe("Japon · Epoch");
  });

  it("falls back to the stored label for an unknown market", () => {
    expect(marketDisplayName("UNKNOWN", "Marché inconnu")).toBe("Marché inconnu");
  });
});
