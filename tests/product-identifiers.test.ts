import { describe, expect, it } from "vitest";
import { findIdentifierCollisions, identifierObservationKey, isValidGtinChecksum, normalizeProductIdentifier } from "../lib/product-identifiers";

describe("product identifiers", () => {
  it("normalizes EAN/GTIN without accepting arbitrary strings", () => {
    expect(normalizeProductIdentifier("EAN", "4008 7897-22164")).toBe("4008789722164");
    expect(normalizeProductIdentifier("EAN", "72216")).toBeNull();
    expect(normalizeProductIdentifier("EAN", "4008789722165")).toBeNull();
    expect(isValidGtinChecksum("4008789722164")).toBe(true);
  });

  it("keeps official SKUs distinct from GTINs", () => {
    expect(normalizeProductIdentifier("OFFICIAL_SKU", " 72216 ")).toBe("72216");
    expect(normalizeProductIdentifier("GTIN", "72216")).toBeNull();
  });

  it("detects a shared identifier across different products", () => {
    expect(findIdentifierCollisions([
      { type: "EAN", normalizedValue: "4008789722164", logicalProductId: "p1" },
      { type: "EAN", normalizedValue: "4008789722164", logicalProductId: "p2" },
    ])).toHaveLength(1);
  });

  it("makes provenance observations idempotent", () => {
    const input = { target: { productId: "p1" }, type: "EAN" as const, normalizedValue: "4008789722164", sourceId: "s1", marketId: "m1" };
    expect(identifierObservationKey(input)).toBe(identifierObservationKey(input));
  });

  it("keeps the proven Product and ProductVariant targets distinct", () => {
    const base = { type: "EAN" as const, normalizedValue: "4008789722164", sourceId: "s1", marketId: "m1" };
    expect(identifierObservationKey({ ...base, target: { productId: "p1" } })).not.toBe(identifierObservationKey({ ...base, target: { variantId: "v1" } }));
  });

  it("does not flag the same EAN observed by several sources for one product", () => {
    expect(findIdentifierCollisions([
      { type: "EAN", normalizedValue: "4008789722164", logicalProductId: "p1" },
      { type: "EAN", normalizedValue: "4008789722164", logicalProductId: "p1" },
    ])).toEqual([]);
  });
});
