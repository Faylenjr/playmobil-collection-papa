import { describe, expect, it } from "vitest";
import { clampInventoryIndex, inventoryStorageKey, needsPhysicalInformation, parseInventoryScope, updateUnknownCounters } from "../lib/collection-inventory";

describe("guided collection inventory", () => {
  it("keeps unknown values independent", () => {
    expect(needsPhysicalInformation({ condition: "GOOD", isComplete: true, hasBox: false, hasInstructions: true })).toBe(false);
    expect(needsPhysicalInformation({ condition: "GOOD", isComplete: true, hasBox: null, hasInstructions: true })).toBe(true);
  });

  it("creates stable scoped resume keys", () => {
    expect(inventoryStorageKey("theme", "Pirates & Corsaires")).toBe("playmobil-inventory:v1:theme:pirates-corsaires");
    expect(parseInventoryScope("box")).toBe("box");
    expect(parseInventoryScope("invalid")).toBe("missing");
  });

  it("restores only an index inside the current selection", () => {
    expect(clampInventoryIndex(12, 84)).toBe(12);
    expect(clampInventoryIndex(100, 84)).toBe(83);
    expect(clampInventoryIndex(-2, 84)).toBe(0);
    expect(clampInventoryIndex(3, 0)).toBe(0);
  });

  it("updates global unknown counters after a saved item", () => {
    expect(updateUnknownCounters(
      { condition: 608, complete: 609, box: 609, instructions: 609 },
      { condition: "UNKNOWN", isComplete: null, hasBox: null, hasInstructions: null },
      { condition: "GOOD", isComplete: true, hasBox: false, hasInstructions: null },
    )).toEqual({ condition: 607, complete: 608, box: 608, instructions: 609 });
  });
});
