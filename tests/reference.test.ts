import { describe, expect, it } from "vitest";
import { canonicalProductKey, parseReference } from "../src/domain/reference.js";
import { resolveIdentityKeys } from "../src/pipeline/import-record.js";

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
    expect(first.ambiguous).toBe(true);
    expect(first.variantKey).not.toBe(second.variantKey);
    expect(first.reason).toBe("non-unique-placeholder-reference");
  });

  it("keeps ordinary duplicate records on the same canonical variant", () => {
    const resolved = resolveIdentityKeys(item("70733v1", "70733-01-gymnast", "Gymnast"), parseReference("70733v1"), {
      name: "Gymnast", releaseYear: 2021, themes: [{ theme: { name: "Figures" } }],
    });
    expect(resolved).toMatchObject({ variantKey: "ref:70733V1", ambiguous: false });
  });

  it("separates an exact reference when several identity signals disagree", () => {
    const resolved = resolveIdentityKeys({ ...item("1234", "different-object", "Space Set"), releaseYear: 2002, theme: "Space" }, parseReference("1234"), {
      name: "Farm Set", releaseYear: 1991, themes: [{ theme: { name: "Farm" } }],
    });
    expect(resolved.ambiguous).toBe(true);
    expect(resolved.reason).toBe("conflicting-identity-signals");
    expect(resolved.variantKey).toMatch(/^ref:1234:record:/);
  });
});
