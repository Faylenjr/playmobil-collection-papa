import type { PrismaClient } from "../../generated/prisma/client.js";

export interface CoverageMetric { field: string; present: number; total: number; percent: number }
const metric = (field: string, present: number, total: number): CoverageMetric => ({ field, present, total, percent: total === 0 ? 0 : Math.round((present / total) * 10_000) / 100 });

export async function buildCoverageReport(db: PrismaClient) {
  const [
    products, variants, sourceRecords, referenceRows, names, namesFr, years, discontinued, themes, mainImages, boxFront, boxBack,
    instructions, figureCounts, pieceCounts, linkedParts, fullPartsInventory, openConflicts, openReviews, sourceStats, yearRows, sourceReferenceValues,
    productKinds, variantKinds, promotions, exclusives, variantPartRows, referenceIdentityKinds, linkedRecordsByVariant,
    unlinkedSourceRecords, openReviewsByReason,
  ] = await Promise.all([
    db.product.count(),
    db.productVariant.count(),
    db.sourceRecord.count({ where: { recordType: "collectible" } }),
    db.productReference.findMany({ select: { normalizedValue: true, variantId: true, identityClass: true } }),
    db.productVariant.count({ where: { OR: [{ name: { not: null } }, { translations: { some: { name: { not: null } } } }] } }),
    db.productVariant.count({ where: { translations: { some: { locale: "fr", name: { not: null } } } } }),
    db.productVariant.count({ where: { releaseYear: { not: null } } }),
    db.productVariant.count({ where: { discontinuedYear: { not: null } } }),
    db.productVariant.count({ where: { themes: { some: {} } } }),
    db.productVariant.count({ where: { media: { some: { kind: "main" } } } }),
    db.productVariant.count({ where: { media: { some: { kind: "box_front" } } } }),
    db.productVariant.count({ where: { media: { some: { kind: "box_back" } } } }),
    db.productVariant.count({ where: { instructions: { some: {} } } }),
    db.productVariant.count({ where: { figureCount: { not: null } } }),
    db.productVariant.count({ where: { pieceCount: { not: null } } }),
    db.productVariant.count({ where: { parts: { some: {} } } }),
    db.productVariant.count({ where: { partsInventoryComplete: true } }),
    db.conflict.count({ where: { status: "OPEN" } }),
    db.reviewTask.count({ where: { status: "OPEN" } }),
    db.source.findMany({ select: { key: true, name: true, records: { select: { id: true } }, importRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, scanned: true, created: true, updated: true, unchanged: true, errors: true, inaccessible: true, startedAt: true, finishedAt: true } } } }),
    db.productVariant.findMany({ where: { releaseYear: { not: null } }, select: { releaseYear: true } }),
    db.sourceValue.findMany({ where: { field: "reference" }, select: { source: { select: { key: true } }, normalizedValue: true } }),
    db.product.groupBy({ by: ["kind"], _count: { _all: true } }),
    db.productVariant.groupBy({ by: ["variantKind"], _count: { _all: true } }),
    db.productVariant.count({ where: { isPromotion: true } }),
    db.productVariant.count({ where: { isExclusive: true } }),
    db.variantPart.count(),
    db.productReference.groupBy({ by: ["identityClass"], _count: { _all: true } }),
    db.sourceRecord.groupBy({ by: ["variantId"], where: { recordType: "collectible", variantId: { not: null } }, _count: { _all: true } }),
    db.sourceRecord.count({ where: { recordType: "collectible", variantId: null } }),
    db.reviewTask.groupBy({ by: ["reason"], where: { status: "OPEN" }, _count: { _all: true } }),
  ]);

  const normalizedReferenceCount = new Set(referenceRows.map((row) => row.normalizedValue)).size;
  const referencedVariants = new Set(referenceRows.map((row) => row.variantId)).size;
  const deduplicatedSourceRecords = linkedRecordsByVariant.reduce((total, row) => total + Math.max(0, row._count._all - 1), 0);
  const referenceGroups = new Map<string, { variants: Set<string>; classes: Set<string> }>();
  for (const row of referenceRows) {
    const group = referenceGroups.get(row.normalizedValue) ?? { variants: new Set<string>(), classes: new Set<string>() };
    group.variants.add(row.variantId);
    group.classes.add(row.identityClass);
    referenceGroups.set(row.normalizedValue, group);
  }
  const reusedReferenceGroups = [...referenceGroups.values()].filter((group) => group.variants.size > 1 && group.classes.has("REUSED")).length;
  const ambiguousReferenceGroups = [...referenceGroups.values()].filter((group) => group.variants.size > 1 && group.classes.has("AMBIGUOUS")).length;

  const decadeMap = new Map<number, number>();
  for (const row of yearRows) if (row.releaseYear) decadeMap.set(Math.floor(row.releaseYear / 10) * 10, (decadeMap.get(Math.floor(row.releaseYear / 10) * 10) ?? 0) + 1);
  const referencesBySource = new Map<string, Set<string>>();
  const sourcesByReference = new Map<string, Set<string>>();
  for (const row of sourceReferenceValues) {
    const value = JSON.stringify(row.normalizedValue);
    if (!referencesBySource.has(row.source.key)) referencesBySource.set(row.source.key, new Set());
    referencesBySource.get(row.source.key)!.add(value);
    if (!sourcesByReference.has(value)) sourcesByReference.set(value, new Set());
    sourcesByReference.get(value)!.add(row.source.key);
  }
  const onlyOneSource = [...sourcesByReference.values()].filter((sources) => sources.size === 1).length;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      rawSourceRecords: sourceRecords,
      normalizedReferences: normalizedReferenceCount,
      products,
      variants,
      collectibleObjects: variants,
      // Kept for report compatibility, but now counts only additional source
      // records explicitly linked to an already represented variant.
      duplicatesMerged: deduplicatedSourceRecords,
      deduplicatedSourceRecords,
      unlinkedSourceRecords,
      openConflicts,
      openReviewTasks: openReviews,
      openReviewTasksByReason: Object.fromEntries(openReviewsByReason.map((row) => [row.reason, row._count._all])),
      referenceIdentityClasses: Object.fromEntries(referenceIdentityKinds.map((row) => [row.identityClass, row._count._all])),
      reusedReferenceGroups,
      ambiguousReferenceGroups,
      referencesOnlyInOneSource: onlyOneSource,
    },
    coverage: [
      metric("reference", referencedVariants, variants), metric("name", names, variants), metric("name_fr", namesFr, variants),
      metric("release_year", years, variants), metric("discontinued_year", discontinued, variants), metric("theme", themes, variants),
      metric("main_image", mainImages, variants), metric("box_front", boxFront, variants), metric("box_back", boxBack, variants),
      metric("instructions", instructions, variants), metric("figures_count", figureCounts, variants), metric("parts_count", pieceCounts, variants),
      metric("linked_parts", linkedParts, variants),
      metric("full_parts_inventory", fullPartsInventory, variants),
    ],
    taxonomy: {
      products: Object.fromEntries(productKinds.map((row) => [row.kind, row._count._all])),
      variants: Object.fromEntries(variantKinds.map((row) => [row.variantKind, row._count._all])),
      promotions, exclusives, linkedVariantPartRows: variantPartRows,
    },
    byYear: [...new Map(yearRows.filter((row) => row.releaseYear).map((row) => [row.releaseYear!, 0])).keys()].sort((a, b) => a - b).map((year) => ({ year, count: yearRows.filter((row) => row.releaseYear === year).length })),
    byDecade: [...decadeMap.entries()].sort(([a], [b]) => a - b).map(([decade, count]) => ({ decade, count })),
    bySource: sourceStats.map((source) => ({ key: source.key, name: source.name, rawRecords: source.records.length, uniqueReferences: referencesBySource.get(source.key)?.size ?? 0, latestImport: source.importRuns[0] ?? null })),
  };
}
