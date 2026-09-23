import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { compareIdentitySignals, isPlaceholderReference, type IdentitySnapshot, type ReferenceIdentityClass } from "../domain/identity.js";

const json = (value: unknown) => value as Prisma.InputJsonValue;

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
  predictedTrueIdentityVariants: number;
  trueIdentityReviewsOpen: number;
}

export async function reclassifyIdentities(db: PrismaClient, apply = false): Promise<IdentityReclassificationResult> {
  const references = await db.productReference.findMany({
    include: {
      variant: {
        select: {
          id: true, canonicalKey: true, name: true, releaseYear: true, format: true,
          product: { select: { id: true, canonicalKey: true, kind: true } },
          themes: { select: { theme: { select: { name: true } } }, orderBy: { isPrimary: "desc" } },
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
  const ambiguousVariantGroups: string[][] = [];
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
    const safelyReused = snapshots.every((snapshot, index) => snapshots
      .filter((_, otherIndex) => otherIndex !== index)
      .every((other) => compareIdentitySignals(snapshot, other) === "DISTINCT"));
    const identityClass: ReferenceIdentityClass = safelyReused ? "REUSED" : "AMBIGUOUS";
    const identityReason = safelyReused ? "distinct-objects-reuse-reference" : "true-identity-conflict";
    if (safelyReused) reusedReferenceGroups += 1;
    else {
      ambiguousReferenceGroups += 1;
      ambiguousVariantGroups.push(distinctVariants.map((reference) => reference.variant.id));
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
    for (const [id, assignment] of assignments) await tx.productReference.update({ where: { id }, data: assignment });
    for (const [variantId, identityClass] of variantClasses) {
      if (identityClass === "PLACEHOLDER" || identityClass === "REUSED") {
        const result = await tx.reviewTask.updateMany({
          where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variantId, status: { in: ["OPEN", "IN_REVIEW"] } },
          data: {
            status: "RESOLVED",
            reason: identityClass === "PLACEHOLDER" ? "placeholder-reference" : "reused-reference",
            resolvedAt: new Date(),
            resolutionNote: identityClass === "PLACEHOLDER"
              ? "Expected non-unique placeholder; SourceRecord-qualified identity retained."
              : "Reference reuse confirmed by distinct identity signals; variants remain separate.",
          },
        });
        reviewsResolved += result.count;
      } else if (identityClass === "AMBIGUOUS") {
        await tx.reviewTask.updateMany({
          where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variantId, status: { in: ["OPEN", "IN_REVIEW"] } },
          data: { reason: "true-identity-conflict", resolutionNote: null },
        });
      }
    }
    // One task represents one ambiguous reference group. Existing tasks are
    // retained; a missing task is attached to a stable representative variant.
    for (const variantIds of ambiguousVariantGroups) {
      const existing = await tx.reviewTask.findFirst({
        where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: { in: variantIds }, status: { in: ["OPEN", "IN_REVIEW"] } },
      });
      if (existing) continue;
      const variantId = [...variantIds].sort()[0]!;
      const reference = references.find((row) => row.variantId === variantId);
      await tx.reviewTask.create({
        data: {
          kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variantId, reason: "true-identity-conflict",
          payload: json({ reference: reference?.displayValue, normalizedReference: reference?.normalizedValue, classification: "AMBIGUOUS", relatedVariantIds: variantIds }),
        },
      });
      reviewsCreated += 1;
    }
  });

  const [sourceRecordsLinked, sourceRecordsUnlinked, trueIdentityReviewsOpen] = await Promise.all([
    db.sourceRecord.count({ where: { recordType: "collectible", variantId: { not: null } } }),
    db.sourceRecord.count({ where: { recordType: "collectible", variantId: null } }),
    db.reviewTask.count({ where: { status: "OPEN", kind: "ambiguous-reference", reason: "true-identity-conflict" } }),
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
    predictedTrueIdentityVariants: [...variantClasses.values()].filter((identityClass) => identityClass === "AMBIGUOUS").length,
    trueIdentityReviewsOpen,
  };
}
