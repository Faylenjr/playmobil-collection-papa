import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { compareIdentitySignals, isPlaceholderReference, type IdentitySnapshot, type ReferenceIdentityClass } from "../domain/identity.js";
import { qualifiedIdentityKeys, rekeyVariantIdentity } from "../pipeline/canonical-identity.js";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const WRITE_BATCH_SIZE = 5_000;
const RECLASSIFICATION_TRANSACTION_TIMEOUT_MS = 120_000;

function chunks<T>(values: T[], size = WRITE_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

/**
 * Applies reference classifications in a bounded number of UPDATE statements.
 * Keeping this helper exported makes the no-per-row-write invariant directly
 * testable without needing a database large enough to reproduce a timeout.
 */
export async function applyReferenceAssignments(
  tx: Pick<Prisma.TransactionClient, "productReference">,
  assignments: ReadonlyMap<string, { identityClass: ReferenceIdentityClass; identityReason: string }>,
): Promise<number> {
  const grouped = new Map<string, { identityClass: ReferenceIdentityClass; identityReason: string; ids: string[] }>();
  for (const [id, assignment] of assignments) {
    const key = `${assignment.identityClass}\0${assignment.identityReason}`;
    const group = grouped.get(key) ?? { ...assignment, ids: [] };
    group.ids.push(id);
    grouped.set(key, group);
  }

  let updated = 0;
  for (const group of grouped.values()) {
    for (const ids of chunks(group.ids)) {
      const result = await tx.productReference.updateMany({
        where: { id: { in: ids } },
        data: { identityClass: group.identityClass, identityReason: group.identityReason },
      });
      updated += result.count;
    }
  }
  return updated;
}

const precedence: Record<ReferenceIdentityClass, number> = {
  ASSIGNED: 0,
  PLACEHOLDER: 1,
  REUSED: 2,
  AMBIGUOUS: 3,
};

export interface IdentityReclassificationResult {
  dryRun: boolean;
  referenceRows: number;
  referenceGroups: number;
  classifications: Record<ReferenceIdentityClass, number>;
  reusedReferenceGroups: number;
  ambiguousReferenceGroups: number;
  sourceRecordsLinked: number;
  sourceRecordsUnlinked: number;
  reviewsResolved: number;
  reviewsCreated: number;
  canonicalRekeysPlanned: number;
  predictedTrueIdentityVariants: number;
  trueIdentityReviewsOpen: number;
  trueIdentityReviewsActive: number;
}

export async function reclassifyIdentities(db: PrismaClient, apply = false): Promise<IdentityReclassificationResult> {
  const references = await db.productReference.findMany({
    include: {
      variant: {
        select: {
          id: true, canonicalKey: true, name: true, releaseYear: true, format: true,
          product: { select: { id: true, canonicalKey: true, baseReference: true, kind: true } },
          themes: { select: { theme: { select: { name: true } } }, orderBy: { isPrimary: "desc" } },
          sourceRecords: { select: { externalId: true, source: { select: { key: true } } } },
        },
      },
    },
  });
  const groups = new Map<string, typeof references>();
  for (const reference of references) {
    const group = groups.get(reference.normalizedValue) ?? [];
    group.push(reference);
    groups.set(reference.normalizedValue, group);
  }

  const classifications: Record<ReferenceIdentityClass, number> = { ASSIGNED: 0, PLACEHOLDER: 0, REUSED: 0, AMBIGUOUS: 0 };
  const assignments = new Map<string, { identityClass: ReferenceIdentityClass; identityReason: string }>();
  const variantClasses = new Map<string, ReferenceIdentityClass>();
  const ambiguousVariantGroups: Array<{ normalizedValue: string; variantIds: string[]; reason: string }> = [];
  const canonicalRekeys = new Map<string, { productKey: string; variantKey: string }>();
  let reusedReferenceGroups = 0;
  let ambiguousReferenceGroups = 0;

  for (const [normalizedValue, group] of groups) {
    if (isPlaceholderReference(normalizedValue)) {
      for (const reference of group) assignments.set(reference.id, { identityClass: "PLACEHOLDER", identityReason: "syntactic-placeholder-reference" });
      continue;
    }
    const distinctVariants = [...new Map(group.map((reference) => [reference.variant.id, reference])).values()];
    if (distinctVariants.length === 1) {
      assignments.set(group[0]!.id, { identityClass: "ASSIGNED", identityReason: "unique-assigned-reference" });
      continue;
    }
    const snapshots = distinctVariants.map((reference): IdentitySnapshot => ({
      id: reference.variant.id,
      productId: reference.variant.product.id,
      productKey: reference.variant.product.canonicalKey,
      variantKey: reference.variant.canonicalKey,
      name: reference.variant.name,
      releaseYear: reference.variant.releaseYear,
      themes: reference.variant.themes.map((row) => row.theme.name),
      productKind: reference.variant.product.kind,
      format: reference.variant.format,
    }));
    const pairwiseDistinct = snapshots.every((snapshot, index) => snapshots
      .filter((_, otherIndex) => otherIndex !== index)
      .every((other) => compareIdentitySignals(snapshot, other) === "DISTINCT"));
    const hasStableAnchors = distinctVariants.every((reference) => reference.variant.sourceRecords.length > 0);
    const safelyReused = pairwiseDistinct && hasStableAnchors;
    const identityClass: ReferenceIdentityClass = safelyReused ? "REUSED" : "AMBIGUOUS";
    const identityReason = safelyReused ? "distinct-objects-reuse-reference"
      : pairwiseDistinct ? "missing-source-record-identity" : "true-identity-conflict";
    if (safelyReused) {
      reusedReferenceGroups += 1;
      for (const reference of distinctVariants) {
        const keys = qualifiedIdentityKeys(
          reference.baseValue ?? reference.variant.product.baseReference ?? reference.variant.product.canonicalKey.replace(/^ref:|:record:.*$/g, ""),
          normalizedValue,
          reference.variant.sourceRecords.map((sourceRecord) => ({ sourceKey: sourceRecord.source.key, externalId: sourceRecord.externalId })),
        );
        if (reference.variant.canonicalKey !== keys.variantKey || reference.variant.product.canonicalKey !== keys.productKey) {
          canonicalRekeys.set(reference.variant.id, keys);
        }
      }
    }
    else {
      ambiguousReferenceGroups += 1;
      ambiguousVariantGroups.push({ normalizedValue, variantIds: distinctVariants.map((reference) => reference.variant.id), reason: identityReason });
    }
    for (const reference of group) assignments.set(reference.id, { identityClass, identityReason });
  }

  for (const reference of references) {
    const assignment = assignments.get(reference.id) ?? { identityClass: "ASSIGNED" as const, identityReason: "unique-assigned-reference" };
    classifications[assignment.identityClass] += 1;
    const previous = variantClasses.get(reference.variantId);
    if (!previous || precedence[assignment.identityClass] > precedence[previous]) variantClasses.set(reference.variantId, assignment.identityClass);
  }

  let reviewsResolved = 0;
  let reviewsCreated = 0;
  if (apply) await db.$transaction(async (tx) => {
    await applyReferenceAssignments(tx, assignments);
    for (const [variantId, keys] of canonicalRekeys) await rekeyVariantIdentity(tx, variantId, keys);
    const resolvedAt = new Date();
    for (const identityClass of ["PLACEHOLDER", "REUSED"] as const) {
      const variantIds = [...variantClasses]
        .filter(([, candidateClass]) => candidateClass === identityClass)
        .map(([variantId]) => variantId);
      for (const entityIds of chunks(variantIds)) {
        const result = await tx.reviewTask.updateMany({
          where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: { in: entityIds }, status: { in: ["OPEN", "IN_REVIEW"] } },
          data: {
            status: "RESOLVED",
            reason: identityClass === "PLACEHOLDER" ? "placeholder-reference" : "reused-reference",
            resolvedAt,
            resolutionNote: identityClass === "PLACEHOLDER"
              ? "Expected non-unique placeholder; SourceRecord-qualified identity retained."
              : "Reference reuse confirmed by distinct identity signals; variants remain separate.",
          },
        });
        reviewsResolved += result.count;
      }
    }
    for (const group of ambiguousVariantGroups) {
      const active = await tx.reviewTask.findMany({
        where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: { in: group.variantIds }, status: { in: ["OPEN", "IN_REVIEW"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      // Prefer work already in progress, then the oldest task and UUID. This is
      // deterministic and leaves exactly one active task for the whole group.
      active.sort((left, right) => {
        const status = Number(left.status !== "IN_REVIEW") - Number(right.status !== "IN_REVIEW");
        if (status !== 0) return status;
        const created = left.createdAt.getTime() - right.createdAt.getTime();
        return created !== 0 ? created : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      });
      const representative = active[0];
      if (representative) {
        await tx.reviewTask.update({ where: { id: representative.id }, data: { reason: group.reason } });
        for (const redundant of active.slice(1)) {
          await tx.reviewTask.update({
            where: { id: redundant.id },
            data: {
              status: "RESOLVED",
              reason: "duplicate-identity-review",
              resolvedAt: new Date(),
              resolutionNote: `Consolidated into ReviewTask ${representative.id} for ambiguous reference ${group.normalizedValue}.`,
            },
          });
          reviewsResolved += 1;
        }
        continue;
      }
      const variantId = [...group.variantIds].sort()[0]!;
      const reference = references.find((row) => row.variantId === variantId);
      await tx.reviewTask.create({
        data: {
          kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variantId, reason: group.reason,
          payload: json({ reference: reference?.displayValue, normalizedReference: reference?.normalizedValue, classification: "AMBIGUOUS", relatedVariantIds: group.variantIds }),
        },
      });
      reviewsCreated += 1;
    }
  }, { timeout: RECLASSIFICATION_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 });

  const [sourceRecordsLinked, sourceRecordsUnlinked, trueIdentityReviewsOpen, trueIdentityReviewsActive] = await Promise.all([
    db.sourceRecord.count({ where: { recordType: "collectible", variantId: { not: null } } }),
    db.sourceRecord.count({ where: { recordType: "collectible", variantId: null } }),
    db.reviewTask.count({ where: { status: "OPEN", kind: "ambiguous-reference", reason: "true-identity-conflict" } }),
    db.reviewTask.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] }, kind: "ambiguous-reference", reason: "true-identity-conflict" } }),
  ]);
  return {
    dryRun: !apply,
    referenceRows: references.length,
    referenceGroups: groups.size,
    classifications,
    reusedReferenceGroups,
    ambiguousReferenceGroups,
    sourceRecordsLinked,
    sourceRecordsUnlinked,
    reviewsResolved,
    reviewsCreated,
    canonicalRekeysPlanned: canonicalRekeys.size,
    predictedTrueIdentityVariants: [...variantClasses.values()].filter((identityClass) => identityClass === "AMBIGUOUS").length,
    trueIdentityReviewsOpen,
    trueIdentityReviewsActive,
  };
}
