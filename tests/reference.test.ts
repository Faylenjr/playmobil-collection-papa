import { describe, expect, it } from "vitest";
import { canonicalProductKey, parseReference } from "../src/domain/reference.js";
import { isPlaceholderReference, resolveIdentityKeys, type IdentitySnapshot } from "../src/domain/identity.js";

describe("parseReference", () => {
  it.each([
    ["70733", "70733", "70733", null, "none"],
    ["70733v1", "70733V1", "70733", "V1", "version"],
    ["3134-B", "3134-B", "3134", "B", "edition"],
    ["5825-usa", "5825-USA", "5825", "USA", "market"],
    ["30794614-bel-fra", "30794614-BEL-FRA", "30794614", "BEL-FRA", "market"],
    ["PM2305D", "PM2305D", "PM2305D", null, "none"],
    ["5599v12", "5599V12", "5599", "V12", "version"],
    ["72378-gre-ita", "72378-GRE-ITA", "72378", "GRE-ITA", "market"],
    ["LADLH-33", "LADLH-33", "LADLH-33", null, "none"],
  ])("parses %s without losing identity", (input, normalized, base, suffix, signal) => {
    expect(parseReference(input)).toMatchObject({ normalized, base, suffix, signal });
  });

  it("normalizes unicode dashes and whitespace", () => expect(parseReference(" 3134–B ").normalized).toBe("3134-B"));
  it("groups explicit variants under the same base product", () => expect(canonicalProductKey(parseReference("70733v3"))).toBe("ref:70733"));
  it("rejects empty input", () => expect(() => parseReference("   ")).toThrow(/empty/));
});

describe("resolveIdentityKeys", () => {
  const item = (reference: string, externalId: string, name = "Example") => ({
    source: "klickypedia", externalId, sourceUrl: `https://example.test/${externalId}`,
    reference, name, raw: {},
  });

  it("never merges distinct placeholder references", () => {
    const first = resolveIdentityKeys(item("00000", "catalogue-1974"), parseReference("00000"));
    const second = resolveIdentityKeys(item("00000", "stickers-2000"), parseReference("00000"));
    expect(first.needsReview).toBe(false);
    expect(first.variantKey).not.toBe(second.variantKey);
    expect(first).toMatchObject({ referenceClass: "PLACEHOLDER", reason: "placeholder-reference" });
  });

  it.each(["0", "00", "0000", "00000", "0-ger", "0-gre", "0000v1-esp", "0000v2-esp", "N/A", "N/A-ita"])(
    "classifies %s as an anchored placeholder",
    (reference) => expect(isPlaceholderReference(reference)).toBe(true),
  );

  it.each(["0001", "0104-sch", "10000", "N-A", "PM0000"])(
    "does not misclassify legitimate-looking reference %s",
    (reference) => expect(isPlaceholderReference(reference)).toBe(false),
  );

  const candidate = (overrides: Partial<IdentitySnapshot> = {}): IdentitySnapshot => ({
    id: "existing", productId: "product", productKey: "ref:1234", variantKey: "ref:1234",
    name: "Example", releaseYear: 2000, themes: ["Example theme"], productKind: "SET", format: "Set",
    referenceClass: "ASSIGNED", ...overrides,
  });

  it("keeps ordinary duplicate records on the same canonical variant", () => {
    const resolved = resolveIdentityKeys({ ...item("70733v1", "70733-01-gymnast", "Gymnast"), releaseYear: 2021, theme: "Figures" }, parseReference("70733v1"), [candidate({
      productKey: "ref:70733", variantKey: "ref:70733V1", name: "Gymnast", releaseYear: 2021, themes: ["Figures"],
    })]);
    expect(resolved).toMatchObject({ variantKey: "ref:70733V1", needsReview: false, referenceClass: "ASSIGNED" });
  });

  it("classifies 3133 in 1980 and 2003 as a reused reference", () => {
    const resolved = resolveIdentityKeys({ ...item("3133", "3133-special-edition", "Special Edition 25 Years Pirates"), releaseYear: 2003, theme: "Pirates" }, parseReference("3133"), [candidate({
      productKey: "ref:3133", variantKey: "ref:3133", name: "Go karts", releaseYear: 1980, themes: ["Racing"],
    })]);
    expect(resolved).toMatchObject({ referenceClass: "REUSED", needsReview: false, reason: "reused-reference" });
    expect(resolved.variantKey).toMatch(/^ref:3133:record:/);
  });

  it("classifies 30803590-ger character names as reused figure identities", () => {
    const resolved = resolveIdentityKeys({ ...item("30803590-ger", "captain", "Captain"), releaseYear: 2000, theme: "Pirates", format: "Figures" }, parseReference("30803590-ger"), [candidate({
      productKey: "ref:30803590", variantKey: "ref:30803590-GER", name: "Clown", releaseYear: 2000, themes: ["Circus"], productKind: "FIGURE", format: "Figures",
    })]);
    expect(resolved).toMatchObject({ referenceClass: "REUSED", needsReview: false });
  });

  it("classifies 30840256-ger catalogues from different years as reused", () => {
    const resolved = resolveIdentityKeys({ ...item("30840256-ger", "catalogue-2022", "Main Catalogue 2022"), releaseYear: 2022, format: "Catalogue" }, parseReference("30840256-ger"), [candidate({
      productKey: "ref:30840256", variantKey: "ref:30840256-GER", name: "Main Catalogue 2004", releaseYear: 2004, themes: [], productKind: "CATALOGUE", format: "Catalogue",
    })]);
    expect(resolved).toMatchObject({ referenceClass: "REUSED", needsReview: false });
  });

  it("uses explicit red/green qualifiers as distinct signals for 30825013-ger", () => {
    const resolved = resolveIdentityKeys({ ...item("30825013-ger", "share-smile-red", "Playmobil Share the Smile 40º (red)"), releaseYear: 2014 }, parseReference("30825013-ger"), [candidate({
      productKey: "ref:30825013", variantKey: "ref:30825013-GER", name: "Playmobil Share the Smile 40º (green)", releaseYear: 2014, themes: [],
    })]);
    expect(resolved).toMatchObject({ referenceClass: "REUSED", needsReview: false });
  });

  it("keeps a genuinely ambiguous near-match in human review", () => {
    const resolved = resolveIdentityKeys({ ...item("1234", "police-car-set", "Police car set"), releaseYear: 2001, theme: "Police" }, parseReference("1234"), [candidate({
      name: "Police car", releaseYear: 2001, themes: ["Police"],
    })]);
    expect(resolved).toMatchObject({ referenceClass: "AMBIGUOUS", needsReview: true, reason: "true-identity-conflict" });
    expect(resolved.variantKey).toMatch(/^ref:1234:record:/);
  });
});
