export const INVENTORY_SCOPES = ["all", "missing", "condition", "complete", "box", "instructions", "theme", "range", "year"] as const;

export type InventoryScope = (typeof INVENTORY_SCOPES)[number];

export type InventoryPhysicalState = {
  condition: string;
  isComplete: boolean | null;
  hasBox: boolean | null;
  hasInstructions: boolean | null;
};

export function parseInventoryScope(value: string | undefined): InventoryScope {
  return INVENTORY_SCOPES.includes(value as InventoryScope) ? value as InventoryScope : "missing";
}

export function needsPhysicalInformation(item: InventoryPhysicalState) {
  return item.condition === "UNKNOWN" || item.isComplete === null || item.hasBox === null || item.hasInstructions === null;
}

export function inventoryStorageKey(scope: InventoryScope, value = "") {
  const safeValue = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80);
  return `playmobil-inventory:v2:${scope}:${safeValue || "all"}`;
}

export function clampInventoryIndex(index: number, total: number) {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), total - 1));
}

export function updateUnknownCounters(
  counters: { condition: number; complete: number; box: number; instructions: number },
  before: InventoryPhysicalState,
  after: InventoryPhysicalState,
) {
  return {
    condition: counters.condition + Number(after.condition === "UNKNOWN") - Number(before.condition === "UNKNOWN"),
    complete: counters.complete + Number(after.isComplete === null) - Number(before.isComplete === null),
    box: counters.box + Number(after.hasBox === null) - Number(before.hasBox === null),
    instructions: counters.instructions + Number(after.hasInstructions === null) - Number(before.hasInstructions === null),
  };
}
