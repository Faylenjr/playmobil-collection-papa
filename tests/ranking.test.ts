import { describe, expect, it } from "vitest";
import { explainCollectorPriority } from "../lib/ranking";

describe("collector-first catalogue ranking", () => {
  it("ranks a complete farm above a farmer, animal and accessory", () => {
    const largeFarm = explainCollectorPriority({ productKind: "SET", pieceCount: 312, figureCount: 5, format: "Large boxed set", hasAssignedReference: true });
    const farmer = explainCollectorPriority({ productKind: "FIGURE", pieceCount: 7, figureCount: 1, format: "Figure", hasAssignedReference: false });
    const cow = explainCollectorPriority({ productKind: "FIGURE", pieceCount: 1, format: "Animal", hasAssignedReference: false });
    const bucket = explainCollectorPriority({ productKind: "ACCESSORY", pieceCount: 1, format: "Accessory", hasAssignedReference: false });
    expect(largeFarm.score).toBeGreaterThan(farmer.score);
    expect(farmer.score).toBeGreaterThan(cow.score);
    expect(cow.score).toBeGreaterThan(bucket.score);
  });

  it("does not use popularity or sales signals", () => {
    const result = explainCollectorPriority({ productKind: "SET", pieceCount: 100, hasAssignedReference: true });
    expect(result.reasons.join(" ")).not.toMatch(/popular|vente/i);
  });
});
