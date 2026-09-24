import { describe, expect, it } from "vitest";
import { explainCollectorPriority } from "../lib/ranking";

describe("collector-first catalogue ranking", () => {
  it("ranks a complete farm above a farmer, animal and accessory", () => {
    const largeFarm = explainCollectorPriority({ productKind: "SET", pieceCount: 312, figureCount: 5, format: "Large boxed set", hasAssignedReference: true });
    const farmer = explainCollectorPriority({ productKind: "FIGURE", pieceCount: 7, figureCount: 1, format: "Figure", name: "Farmer", hasAssignedReference: true });
    const cow = explainCollectorPriority({ productKind: "FIGURE", pieceCount: 1, format: "Animal", name: "Cow", hasAssignedReference: true });
    const bucket = explainCollectorPriority({ productKind: "ACCESSORY", pieceCount: 1, format: "Accessory", hasAssignedReference: true });
    expect(largeFarm.score).toBeGreaterThan(farmer.score);
    expect(farmer.score).toBeGreaterThan(cow.score);
    expect(cow.score).toBeGreaterThan(bucket.score);
  });

  it("does not use popularity or sales signals", () => {
    const result = explainCollectorPriority({ productKind: "SET", pieceCount: 100, hasAssignedReference: true });
    expect(result.reasons.join(" ")).not.toMatch(/popular|vente/i);
  });

  it("keeps buildings and vehicles above figure assortments despite edition metadata", () => {
    const restaurant = explainCollectorPriority({ productKind: "SET", name: "Burger King Restaurant", format: "Standard Box", figureCount: 4, hasAssignedReference: true });
    const tractor = explainCollectorPriority({ productKind: "SET", name: "Tractor with Hay Bales", format: "Standard Box", hasAssignedReference: true });
    const figures = explainCollectorPriority({ productKind: "SET", name: "My Figures: Shopping", format: "Standard Box", figureCount: 4, variantKind: "EDITION", hasAssignedReference: true });
    expect(restaurant.category).toBe("bâtiment ou playset");
    expect(tractor.category).toBe("véhicule important");
    expect(figures.category).toBe("figurine");
    expect(restaurant.score).toBeGreaterThan(tractor.score);
    expect(tractor.score).toBeGreaterThan(figures.score);
  });

  it("places unassigned references last", () => {
    const uncertainCastle = explainCollectorPriority({ productKind: "SET", name: "Large Castle", hasAssignedReference: false });
    const accessory = explainCollectorPriority({ productKind: "ACCESSORY", format: "Accessory", hasAssignedReference: true });
    expect(uncertainCastle.score).toBe(0);
    expect(accessory.score).toBeGreaterThan(uncertainCastle.score);
  });
});
