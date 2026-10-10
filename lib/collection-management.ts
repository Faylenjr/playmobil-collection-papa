export type PhysicalCollectionRow = {
  condition: string;
  isComplete: boolean | null;
  hasBox: boolean | null;
  hasInstructions: boolean | null;
  purchaseDate: Date | null;
  purchasePrice: unknown | null;
  notes: string | null;
};

export function parseTriState(value: FormDataEntryValue | string | null | undefined) {
  return value === "yes" ? true : value === "no" ? false : null;
}

export function summarizeCollectionQuality(rows: PhysicalCollectionRow[]) {
  const tri = (select: (row: PhysicalCollectionRow) => boolean | null) => ({
    yes: rows.filter((row) => select(row) === true).length,
    no: rows.filter((row) => select(row) === false).length,
    unknown: rows.filter((row) => select(row) === null).length,
  });
  return {
    total: rows.length,
    copies: rows.length,
    needsReview: rows.filter((row) => row.condition === "UNKNOWN" || row.isComplete === null || row.hasBox === null || row.hasInstructions === null || row.purchaseDate === null || row.purchasePrice === null).length,
    condition: { known: rows.filter(({ condition }) => condition !== "UNKNOWN").length, unknown: rows.filter(({ condition }) => condition === "UNKNOWN").length },
    complete: tri((row) => row.isComplete),
    box: tri((row) => row.hasBox),
    instructions: tri((row) => row.hasInstructions),
    purchaseDate: { known: rows.filter(({ purchaseDate }) => purchaseDate !== null).length, unknown: rows.filter(({ purchaseDate }) => purchaseDate === null).length },
    purchasePrice: { known: rows.filter(({ purchasePrice }) => purchasePrice !== null).length, unknown: rows.filter(({ purchasePrice }) => purchasePrice === null).length },
    notes: { known: rows.filter(({ notes }) => Boolean(notes?.trim())).length, unknown: rows.filter(({ notes }) => !notes?.trim()).length },
    suspiciousQuantity: 0,
  };
}

export type LegacyCopyMetadata = Omit<PhysicalCollectionRow, never> & {
  boxCondition?: string | null;
  currency?: string | null;
};

/** Mirrors the conservative SQL backfill: only copy #1 inherits old physical data. */
export function projectLegacyCopies(quantity: number, metadata: LegacyCopyMetadata) {
  const count = Math.max(1, Math.trunc(quantity) || 1);
  return Array.from({ length: count }, (_, index) => index === 0 ? { ...metadata } : {
    condition: "UNKNOWN",
    isComplete: null,
    hasBox: null,
    hasInstructions: null,
    purchaseDate: null,
    purchasePrice: null,
    notes: null,
    boxCondition: null,
    currency: null,
  });
}

export function copyLabel(index: number, total: number) {
  return total > 1 ? `Exemplaire ${index + 1} sur ${total}` : "Mon exemplaire";
}

export function logicalDuplicateGroups(items: Array<{ variantId: string; productId: string }>) {
  const groups = new Map<string, string[]>();
  for (const item of items) groups.set(item.productId, [...(groups.get(item.productId) ?? []), item.variantId]);
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([productId, variantIds]) => ({ productId, variantIds }));
}
