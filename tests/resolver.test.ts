import { describe, expect, it } from "vitest";
import { resolveCandidates } from "../src/domain/resolver.js";

const date = new Date("2026-09-22T00:00:00Z");

describe("resolveCandidates", () => {
  it("retains conflicts while selecting the highest-priority source", () => {
    const result = resolveCandidates([
      { id: "community", source: "klickypedia", value: 1995, priority: 30, confidence: 0.9, retrievedAt: date },
      { id: "official", source: "playmobil", value: 1994, priority: 10, confidence: 0.9, retrievedAt: date },
    ]);
    expect(result.selected?.value).toBe(1994);
    expect(result.conflict).toBe(true);
    expect(result.candidates).toHaveLength(2);
  });

  it("does not report a conflict for matching normalized values", () => {
    const result = resolveCandidates([
      { id: "a", source: "a", value: "Pirates", priority: 10, confidence: 1, retrievedAt: date },
      { id: "b", source: "b", value: "Pirates", priority: 20, confidence: 1, retrievedAt: date },
    ]);
    expect(result.conflict).toBe(false);
  });
});
