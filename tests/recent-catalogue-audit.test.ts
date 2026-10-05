import { describe, expect, it } from "vitest";
import { classifyRecentEntry, type LocalReference, type SnapshotEntry } from "../lib/recent-catalogue-audit";

const entry: SnapshotEntry = { reference: "72112", name: "Castle", theme: "Knights", announcedMonth: "Mai", announcedYear: 2026, url: "https://example.test/72112" };
const row: LocalReference = { productId: "p1", variantId: "v1", releaseYear: 2026, productKind: "SET", format: "Medium", displayValue: "72112", normalizedValue: "72112", baseValue: "72112", suffix: null, identityClass: "ASSIGNED" };

describe("recent catalogue comparison", () => {
  it("matches an exact commercial reference in the announced year", () => expect(classifyRecentEntry(entry, [row])).toBe("PRESENT_EXACT"));
  it("recognises a market-only variant", () => expect(classifyRecentEntry(entry, [{ ...row, displayValue: "72112-GER", normalizedValue: "72112-GER", suffix: "GER" }])).toBe("PRESENT_OTHER_VARIANT"));
  it("separates year conflicts from missing references", () => {
    expect(classifyRecentEntry(entry, [{ ...row, releaseYear: 2025 }])).toBe("PRESENT_DIFFERENT_YEAR");
    expect(classifyRecentEntry(entry, [])).toBe("MISSING_LOCAL");
  });
  it("does not force ambiguous identities, while still recognising documented non-set products", () => {
    expect(classifyRecentEntry(entry, [{ ...row, identityClass: "AMBIGUOUS" }])).toBe("AMBIGUOUS");
    expect(classifyRecentEntry(entry, [{ ...row, productKind: "CATALOGUE" }])).toBe("PRESENT_EXACT");
  });
});
