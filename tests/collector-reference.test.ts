import { describe, expect, it } from "vitest";
import { classifyCollectorReference, collectorReferenceNumericValue, type CollectorReferenceFacts } from "../lib/collector-reference";

const reference = (overrides: Partial<CollectorReferenceFacts> = {}): CollectorReferenceFacts => ({
  identityClass: "ASSIGNED",
  displayValue: "70201",
  normalizedValue: "70201",
  baseValue: "70201",
  productKind: "SET",
  format: "Standard Box",
  ...overrides,
});

describe("collector references", () => {
  it("recognizes modern, historical and market-suffixed commercial references", () => {
    expect(classifyCollectorReference(reference())).toBe("COMMERCIAL");
    expect(classifyCollectorReference(reference({ normalizedValue: "3133", baseValue: "3133", identityClass: "REUSED" }))).toBe("COMMERCIAL");
    expect(classifyCollectorReference(reference({ normalizedValue: "060-SCH", baseValue: "060", suffix: "SCH" }))).toBe("COMMERCIAL");
  });

  it("keeps technical and special references after normal commercial references", () => {
    expect(classifyCollectorReference(reference({ normalizedValue: "01442403-GER", baseValue: "01442403", suffix: "GER", productKind: "MERCHANDISE", format: "Other" }))).toBe("SPECIAL");
    expect(classifyCollectorReference(reference({ normalizedValue: "30841060-GER", baseValue: "30841060", productKind: "CATALOGUE", format: "Magazin" }))).toBe("SPECIAL");
  });

  it("puts placeholders and ambiguous identities last", () => {
    expect(classifyCollectorReference(reference({ normalizedValue: "N/A", baseValue: "N/A", identityClass: "PLACEHOLDER" }))).toBe("NON_COLLECTOR");
    expect(classifyCollectorReference(reference({ normalizedValue: "00000", baseValue: "00000", identityClass: "PLACEHOLDER" }))).toBe("NON_COLLECTOR");
    expect(classifyCollectorReference(reference({ identityClass: "AMBIGUOUS" }))).toBe("NON_COLLECTOR");
  });

  it("exposes the numeric key only for commercial references", () => {
    expect(collectorReferenceNumericValue(reference())).toBe(70201);
    expect(collectorReferenceNumericValue(reference({ normalizedValue: "01442403-GER", baseValue: "01442403", productKind: "MERCHANDISE" }))).toBeNull();
  });
});
