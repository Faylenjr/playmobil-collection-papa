import { describe, expect, it } from "vitest";
import { classifyCollectorItem, explainCollectorPriority } from "../lib/ranking";

describe("structured collector classification", () => {
  it("ranks a main set above a figure, animal and accessory", () => {
    const main = explainCollectorPriority({ productKind: "SET", pieceCount: 312, figureCount: 5, format: "Standard Box", hasAssignedReference: true });
    const figure = explainCollectorPriority({ productKind: "FIGURE", figureCount: 1, format: "Figures", tags: ["farmers"], hasAssignedReference: true });
    const animal = explainCollectorPriority({ productKind: "SET", figureCount: 0, format: "DS", tags: ["domestic animals"], hasAssignedReference: true });
    const accessory = explainCollectorPriority({ productKind: "ACCESSORY", format: "DS", hasAssignedReference: true });
    expect(main.score).toBeGreaterThan(figure.score);
    expect(figure.score).toBeGreaterThan(animal.score);
    expect(animal.score).toBeGreaterThan(accessory.score);
  });

  it("ranks structured buildings and vehicles above figures", () => {
    const building = explainCollectorPriority({ productKind: "SET", format: "Standard Box", tags: ["buildings"], hasAssignedReference: true });
    const vehicle = explainCollectorPriority({ productKind: "SET", format: "Standard Box", tags: ["cars"], hasAssignedReference: true });
    const figure = explainCollectorPriority({ productKind: "FIGURE", format: "Figures", figureCount: 1, hasAssignedReference: true });
    expect(building.category).toBe("BUILDING_SET");
    expect(vehicle.category).toBe("VEHICLE_SET");
    expect(building.score).toBeGreaterThan(figure.score);
    expect(vehicle.score).toBeGreaterThan(figure.score);
  });

  it("ranks single figures above accessories and animals above parts", () => {
    const figure = explainCollectorPriority({ productKind: "FIGURE", format: "Figures", figureCount: 1, hasAssignedReference: true });
    const accessory = explainCollectorPriority({ productKind: "ACCESSORY", hasAssignedReference: true });
    const animal = explainCollectorPriority({ productKind: "SET", format: "DS", tags: ["wild animals"], hasAssignedReference: true });
    const part = explainCollectorPriority({ productKind: "PART", hasAssignedReference: true });
    expect(figure.score).toBeGreaterThan(accessory.score);
    expect(animal.score).toBeGreaterThan(part.score);
  });

  it("penalizes placeholder or unassigned references", () => {
    const uncertain = explainCollectorPriority({ productKind: "SET", format: "Standard Box", tags: ["castle"], hasAssignedReference: false });
    expect(uncertain.category).toBe("UNKNOWN");
    expect(uncertain.score).toBe(0);
  });

  it("returns UNKNOWN when structured evidence is insufficient", () => {
    expect(classifyCollectorItem({ productKind: "UNKNOWN", format: "Other", hasAssignedReference: true })).toBe("UNKNOWN");
    expect(classifyCollectorItem({ productKind: "SET", format: "Other", hasAssignedReference: true })).toBe("UNKNOWN");
  });

  it("does not use popularity, sales or product-name keywords", () => {
    const result = explainCollectorPriority({ productKind: "SET", format: "Other", hasAssignedReference: true });
    expect(result.category).toBe("UNKNOWN");
    expect(result.reasons.join(" ")).not.toMatch(/popular|vente|large|mega/i);
  });
});
