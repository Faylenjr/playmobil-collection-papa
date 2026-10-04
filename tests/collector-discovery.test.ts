import { describe, expect, it } from "vitest";
import { classifyMarketRelation, isXxlCollectorCandidate } from "../lib/collector-taxonomy";

describe("collector transverse categories", () => {
  it("keeps only structured XXL decoration figures", () => {
    expect(isXxlCollectorCandidate({ format: "Decoration toy", variantName: "XXL Pirate", productName: null })).toBe(true);
    expect(isXxlCollectorCandidate({ format: "Standard Box", variantName: "Giant Octopus with Pirates", productName: null })).toBe(false);
    expect(isXxlCollectorCandidate({ format: "Bag", variantName: "Carrier Bag Size XXL", productName: null })).toBe(false);
    expect(isXxlCollectorCandidate({ format: "Calendar", variantName: "XXL Advent calendar", productName: null })).toBe(false);
  });
});

describe("market evidence", () => {
  it("does not turn a GER market suffix into an exclusivity", () => {
    expect(classifyMarketRelation({ variantKind: "MARKET", rawPayload: { markets: ["germany"] } }).kind).toBe("MARKET_EDITION");
  });

  it("requires an explicit source claim for an attested exclusivity", () => {
    expect(classifyMarketRelation({ variantKind: "MARKET", rawPayload: { exclusive: "Karstadt" } })).toMatchObject({ kind: "ATTESTED_EXCLUSIVE", confidence: 0.9 });
  });
});
