import { describe, expect, it } from "vitest";
import { canonicalProductKey, parseReference } from "../src/domain/reference.js";

describe("parseReference", () => {
  it.each([
    ["70733", "70733", "70733", null, "none"],
    ["70733v1", "70733V1", "70733", "V1", "version"],
    ["3134-B", "3134-B", "3134", "B", "edition"],
    ["5825-usa", "5825-USA", "5825", "USA", "market"],
    ["30794614-bel-fra", "30794614-BEL-FRA", "30794614", "BEL-FRA", "market"],
    ["PM2305D", "PM2305D", "PM2305D", null, "none"],
  ])("parses %s without losing identity", (input, normalized, base, suffix, signal) => {
    expect(parseReference(input)).toMatchObject({ normalized, base, suffix, signal });
  });

  it("normalizes unicode dashes and whitespace", () => expect(parseReference(" 3134–B ").normalized).toBe("3134-B"));
  it("groups explicit variants under the same base product", () => expect(canonicalProductKey(parseReference("70733v3"))).toBe("ref:70733"));
  it("rejects empty input", () => expect(() => parseReference("   ")).toThrow(/empty/));
});
