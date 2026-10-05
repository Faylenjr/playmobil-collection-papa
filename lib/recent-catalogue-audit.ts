export type RecentAuditStatus =
  | "PRESENT_EXACT"
  | "PRESENT_OTHER_VARIANT"
  | "PRESENT_DIFFERENT_YEAR"
  | "MISSING_LOCAL"
  | "AMBIGUOUS"
  | "INVALID_OR_NON_PRODUCT";

export type SnapshotEntry = {
  reference: string;
  name: string;
  theme: string | null;
  announcedMonth: string | null;
  announcedYear: number;
  url: string;
};

export type LocalReference = {
  productId: string;
  variantId: string;
  releaseYear: number | null;
  productKind: "SET" | "FIGURE" | "PART" | "ACCESSORY" | "MERCHANDISE" | "CATALOGUE" | "PROMOTIONAL_ITEM" | "UNKNOWN";
  format: string | null;
  displayValue: string;
  normalizedValue: string;
  baseValue: string | null;
  suffix: string | null;
  identityClass: "ASSIGNED" | "PLACEHOLDER" | "REUSED" | "AMBIGUOUS";
};

export function classifyRecentEntry(entry: SnapshotEntry, localRows: LocalReference[]): RecentAuditStatus {
  if (!/^\d{3,8}$/.test(entry.reference)) return "INVALID_OR_NON_PRODUCT";
  const sameBase = localRows.filter((row) => (row.baseValue ?? row.normalizedValue) === entry.reference);
  if (sameBase.length === 0) return "MISSING_LOCAL";
  if (sameBase.some((row) => row.identityClass === "AMBIGUOUS") || new Set(sameBase.map((row) => row.productId)).size > 1) {
    return "AMBIGUOUS";
  }
  const sameYear = sameBase.filter((row) => row.releaseYear === entry.announcedYear);
  if (sameYear.length === 0) return "PRESENT_DIFFERENT_YEAR";
  const exact = sameYear.some((row) => row.normalizedValue === entry.reference || row.displayValue === entry.reference);
  return exact ? "PRESENT_EXACT" : "PRESENT_OTHER_VARIANT";
}

export function summarizeStatuses(statuses: RecentAuditStatus[]) {
  const ordered: RecentAuditStatus[] = [
    "PRESENT_EXACT",
    "PRESENT_OTHER_VARIANT",
    "PRESENT_DIFFERENT_YEAR",
    "MISSING_LOCAL",
    "AMBIGUOUS",
    "INVALID_OR_NON_PRODUCT",
  ];
  return Object.fromEntries(ordered.map((status) => [status, statuses.filter((value) => value === status).length]));
}
