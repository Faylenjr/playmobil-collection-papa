import { describe, expect, it } from "vitest";
import { classifyMarketRelation, isXxlCollectorCandidate } from "../lib/collector-taxonomy";
import { classifyCommercialContext } from "../lib/commercial-context";

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

  it("does not confuse a commercial channel with a geographic exclusivity", () => {
    expect(classifyMarketRelation({ variantKind: "MARKET", rawPayload: { exclusive: "Karstadt" }, marketCode: "GERMANY" })).toMatchObject({ kind: "MARKET_EDITION", confidence: 0.8 });
  });

  it("requires an explicit market-scoped statement for an attested exclusivity", () => {
    expect(classifyMarketRelation({
      variantKind: "MARKET",
      marketCode: "GERMANY",
      rawPayload: { marketExclusive: { marketCode: "GERMANY", statement: "Germany only" } },
    })).toMatchObject({ kind: "ATTESTED_EXCLUSIVE", confidence: 0.95 });
    expect(classifyMarketRelation({
      variantKind: "MARKET",
      marketCode: "FRANCE",
      rawPayload: { marketExclusive: { marketCode: "GERMANY", statement: "Germany only" } },
    }).kind).toBe("MARKET_EDITION");
  });
});

describe("commercial context", () => {
  it.each([
    ["Kaufland", "RETAILER_DISTRIBUTOR"],
    ["Idee & Spiel", "RETAILER_DISTRIBUTOR"],
    ["Playmobil Magazin Ghostbusters", "MAGAZINE_PUBLICATION"],
    ["Nüremberg International Toy Fair", "EVENT_VENUE"],
    ["DFB Stars", "ORGANIZATION_ASSOCIATION"],
    ["Cruz Roja", "ORGANIZATION_ASSOCIATION"],
  ])("classifies %s independently from geography", (rawValue, expected) => {
    expect(classifyCommercialContext(rawValue).kind).toBe(expected);
  });

  it("uses structured promotional evidence without calling it geographic exclusivity", () => {
    expect(classifyCommercialContext("McDonald's", { tags: ["promotional"] })).toMatchObject({
      kind: "PROMOTIONAL_CAMPAIGN",
    });
  });

  it("keeps ambiguous community exclusivity wording unclassified", () => {
    expect(classifyCommercialContext("Exclusive Greece LYRA")).toMatchObject({
      kind: "OTHER_DOCUMENTED_CONTEXT",
    });
  });
});
