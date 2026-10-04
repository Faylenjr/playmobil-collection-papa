export type CollectorReferenceGroup = "COMMERCIAL" | "SPECIAL" | "NON_COLLECTOR";

export type CollectorReferenceFacts = {
  identityClass: "ASSIGNED" | "PLACEHOLDER" | "REUSED" | "AMBIGUOUS";
  displayValue: string;
  normalizedValue: string;
  baseValue?: string | null;
  suffix?: string | null;
  productKind: "SET" | "FIGURE" | "PART" | "ACCESSORY" | "MERCHANDISE" | "CATALOGUE" | "PROMOTIONAL_ITEM" | "UNKNOWN";
  format?: string | null;
};

const nonCommercialKinds = new Set(["PART", "MERCHANDISE", "CATALOGUE", "PROMOTIONAL_ITEM"]);
const nonCommercialFormats = new Set(["Magazin", "Keychains", "Decoration toy"]);

function hasNormalCollectorNumber(base: string) {
  if (/^\d{3,4}$/.test(base)) return true;
  if (!/^\d{5}$/.test(base)) return false;
  const value = Number.parseInt(base, 10);
  return value >= 70_000 && value <= 72_999;
}

export function classifyCollectorReference(facts: CollectorReferenceFacts): CollectorReferenceGroup {
  const normalized = facts.normalizedValue.trim().toUpperCase();
  const base = (facts.baseValue ?? normalized).trim().toUpperCase();
  if (facts.identityClass === "PLACEHOLDER" || facts.identityClass === "AMBIGUOUS") return "NON_COLLECTOR";
  if (/^(?:N\/?A|UNKNOWN|NONE|NULL|UNASSIGNED)$/.test(normalized) || /^0+$/.test(base)) return "NON_COLLECTOR";
  if (hasNormalCollectorNumber(base)
    && !nonCommercialKinds.has(facts.productKind)
    && !nonCommercialFormats.has(facts.format ?? "")) return "COMMERCIAL";
  return "SPECIAL";
}

export function collectorReferenceNumericValue(facts: CollectorReferenceFacts) {
  if (classifyCollectorReference(facts) !== "COMMERCIAL") return null;
  return Number.parseInt(facts.baseValue ?? facts.normalizedValue, 10);
}
