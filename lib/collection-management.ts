export type PhysicalCollectionRow = {
  quantity: number;
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
    copies: rows.reduce((sum, row) => sum + row.quantity, 0),
    needsReview: rows.filter((row) => row.condition === "UNKNOWN" || row.isComplete === null || row.hasBox === null || row.hasInstructions === null || row.purchaseDate === null || row.purchasePrice === null || row.quantity <= 0 || row.quantity > 20).length,
    condition: { known: rows.filter(({ condition }) => condition !== "UNKNOWN").length, unknown: rows.filter(({ condition }) => condition === "UNKNOWN").length },
    complete: tri((row) => row.isComplete),
    box: tri((row) => row.hasBox),
    instructions: tri((row) => row.hasInstructions),
    purchaseDate: { known: rows.filter(({ purchaseDate }) => purchaseDate !== null).length, unknown: rows.filter(({ purchaseDate }) => purchaseDate === null).length },
    purchasePrice: { known: rows.filter(({ purchasePrice }) => purchasePrice !== null).length, unknown: rows.filter(({ purchasePrice }) => purchasePrice === null).length },
    notes: { known: rows.filter(({ notes }) => Boolean(notes?.trim())).length, unknown: rows.filter(({ notes }) => !notes?.trim()).length },
    suspiciousQuantity: rows.filter(({ quantity }) => quantity <= 0 || quantity > 20).length,
  };
}

export function logicalDuplicateGroups(items: Array<{ variantId: string; productId: string }>) {
  const groups = new Map<string, string[]>();
  for (const item of items) groups.set(item.productId, [...(groups.get(item.productId) ?? []), item.variantId]);
  return [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([productId, variantIds]) => ({ productId, variantIds }));
}
