import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import {
  classifyUrlReferenceEvidence,
  clusterMergedSourceRecords,
  referenceCandidateFromSource,
  type MergedRecordEvidence,
  type MergedIdentityClassification,
  type MergedSafeAction,
  type SourceConsistency,
} from "../domain/merged-record-audit.js";

type Scalar = string | number | boolean | null;

function scalar(value: Prisma.JsonValue | null | undefined): Scalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function rawObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function headingFacts(payload: Prisma.JsonValue | null): { reference: string | null; name: string | null } {
  const heading = scalar(rawObject(payload)?.heading);
  if (typeof heading !== "string") return { reference: null, name: null };
  const match = heading.match(/^Playmobil\s+(.+?)\s+-\s*(.*)$/i);
  return { reference: match?.[1]?.trim() || null, name: match?.[2]?.trim() || null };
}

const stableRecordKey = (record: { source: { key: string }; externalId: string; id: string }) => `${record.source.key}\0${record.externalId}\0${record.id}`;
const compareStableText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

function productKindFromFormat(format: string | null): string | null {
  if (!format) return null;
  if (/figure|character/i.test(format)) return "FIGURE";
  if (/catalog|catalogue|leaflet/i.test(format)) return "CATALOGUE";
  if (/merch|sticker|book|magazine|multimedia/i.test(format)) return "MERCHANDISE";
  if (/promotional|promotion/i.test(format)) return "PROMOTIONAL_ITEM";
  return null;
}

export interface MergedIdentityAuditDetail {
  currentVariantId: string;
  canonicalKey: string;
  reference: string | null;
  references: string[];
  identityClassification: MergedIdentityClassification;
  sourceConsistency: SourceConsistency;
  safeAction: MergedSafeAction;
  decisionReason: string;
  sourceConsistencyReason: string;
  proposedClusters: Array<{ id: string; relationship: "MATCH" | "SINGLETON" | "AMBIGUOUS"; recordIds: string[] }>;
  relations: Array<{ leftRecordId: string; rightRecordId: string; relationship: "MATCH" | "DISTINCT" | "AMBIGUOUS"; reason: string }>;
  sourceRecords: Array<MergedRecordEvidence & { proposedCluster: string }>;
}

export interface MergedIdentityAuditReport {
  dryRun: true;
  variantsScanned: number;
  sourceRecordsScanned: number;
  variantsWithMultipleSourceRecords: number;
  identityMatchGroups: number;
  identityDistinctGroups: number;
  identityAmbiguousGroups: number;
  sourceConsistentGroups: number;
  sourceInconsistentGroups: number;
  sourceUndeterminedGroups: number;
  variantsSafeToKeepMerged: number;
  variantsSafeToSplit: number;
  variantsNeedingReview: number;
  currentVariantCount: number;
  predictedVariantCountAfterSafeSplits: number;
  predictedNewVariants: number;
  details: MergedIdentityAuditDetail[];
}

/** Read-only by design: this job executes only count/findMany queries. */
export async function auditMergedIdentities(
  db: Pick<PrismaClient, "sourceRecord" | "productVariant">,
): Promise<MergedIdentityAuditReport> {
  const [recordLinks, currentVariantCount] = await Promise.all([
    db.sourceRecord.findMany({ where: { variantId: { not: null } }, select: { variantId: true } }),
    db.productVariant.count(),
  ]);
  const counts = new Map<string, number>();
  for (const row of recordLinks) if (row.variantId) counts.set(row.variantId, (counts.get(row.variantId) ?? 0) + 1);
  const candidateIds = [...counts]
    .filter(([, count]) => count > 1)
    .map(([variantId]) => variantId)
    .sort();

  const variants = await db.productVariant.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true,
      canonicalKey: true,
      references: { select: { displayValue: true, normalizedValue: true, isPrimary: true } },
      sourceRecords: {
        select: {
          id: true, externalId: true, sourceUrl: true, contentHash: true, rawPayload: true,
          source: { select: { key: true } },
          values: {
            where: { entityType: "ProductVariant" },
            select: { field: true, rawValue: true, normalizedValue: true, retrievedAt: true },
            orderBy: { retrievedAt: "desc" },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const details: MergedIdentityAuditDetail[] = variants.map((variant) => {
    const evidence = variant.sourceRecords
      .sort((left, right) => compareStableText(stableRecordKey(left), stableRecordKey(right)))
      .map((record): MergedRecordEvidence => {
        const byField = new Map<string, Scalar>();
        for (const value of record.values) if (!byField.has(value.field)) byField.set(value.field, scalar(value.normalizedValue ?? value.rawValue));
        const heading = headingFacts(record.rawPayload);
        const names: Record<string, string> = {};
        for (const [field, value] of [...byField].sort(([left], [right]) => compareStableText(left, right))) {
          if ((field === "name" || field.startsWith("name.")) && typeof value === "string") names[field] = value;
        }
        const name: string | null = names["name.en"] ?? names.name ?? Object.values(names)[0] ?? heading.name;
        const declaredReference = typeof byField.get("reference") === "string" ? byField.get("reference") as string : heading.reference;
        const urlReferenceCandidate = referenceCandidateFromSource(record.source.key, record.externalId, record.sourceUrl);
        const theme = byField.get("theme");
        const releaseYear = byField.get("releaseYear");
        const format = byField.get("format");
        return {
          id: record.id,
          sourceKey: record.source.key,
          externalId: record.externalId,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          declaredReference,
          urlReferenceCandidate,
          urlReferenceEvidence: classifyUrlReferenceEvidence(declaredReference, urlReferenceCandidate),
          names,
          name,
          releaseYear: typeof releaseYear === "number" ? releaseYear : null,
          themes: typeof theme === "string" ? [theme] : [],
          format: typeof format === "string" ? format : null,
          productKind: productKindFromFormat(typeof format === "string" ? format : null),
        };
      });
    const clustered = clusterMergedSourceRecords(evidence);
    const clusterByRecord = new Map(clustered.clusters.flatMap((cluster) => cluster.recordIds.map((recordId) => [recordId, cluster.id] as const)));
    const references = [...new Set(evidence.map((record) => record.declaredReference).filter((value): value is string => Boolean(value)))].sort();
    return {
      currentVariantId: variant.id,
      canonicalKey: variant.canonicalKey,
      reference: references[0] ?? variant.references.find((reference) => reference.isPrimary)?.displayValue ?? variant.references[0]?.displayValue ?? null,
      references,
      identityClassification: clustered.identityClassification,
      sourceConsistency: clustered.sourceConsistency,
      safeAction: clustered.safeAction,
      decisionReason: clustered.decisionReason,
      sourceConsistencyReason: clustered.sourceConsistencyReason,
      proposedClusters: clustered.clusters,
      relations: clustered.relations,
      sourceRecords: evidence.map((record) => ({ ...record, proposedCluster: clusterByRecord.get(record.id)! })),
    };
  });

  const identityCount = (classification: MergedIdentityClassification) => details
    .filter((detail) => detail.identityClassification === classification).length;
  const consistencyCount = (classification: SourceConsistency) => details
    .filter((detail) => detail.sourceConsistency === classification).length;
  const actionCount = (action: MergedSafeAction) => details.filter((detail) => detail.safeAction === action).length;
  const identityMatchGroups = identityCount("MATCH");
  const identityDistinctGroups = identityCount("DISTINCT");
  const identityAmbiguousGroups = identityCount("AMBIGUOUS");
  const sourceConsistentGroups = consistencyCount("CONSISTENT");
  const sourceInconsistentGroups = consistencyCount("INCONSISTENT");
  const sourceUndeterminedGroups = consistencyCount("UNDETERMINED");
  const predictedNewVariants = details
    .filter((detail) => detail.safeAction === "SPLIT")
    .reduce((total, detail) => total + detail.proposedClusters.length - 1, 0);

  return {
    dryRun: true,
    variantsScanned: variants.length,
    sourceRecordsScanned: variants.reduce((total, variant) => total + variant.sourceRecords.length, 0),
    variantsWithMultipleSourceRecords: variants.length,
    identityMatchGroups,
    identityDistinctGroups,
    identityAmbiguousGroups,
    sourceConsistentGroups,
    sourceInconsistentGroups,
    sourceUndeterminedGroups,
    variantsSafeToKeepMerged: actionCount("KEEP_MERGED"),
    variantsSafeToSplit: actionCount("SPLIT"),
    variantsNeedingReview: actionCount("REVIEW"),
    currentVariantCount,
    predictedVariantCountAfterSafeSplits: currentVariantCount + predictedNewVariants,
    predictedNewVariants,
    details,
  };
}
