import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const sourceRecordSchema = z.object({
  id: z.string().uuid(),
  sourceKey: z.string().min(1),
  externalId: z.string().min(1),
  contentHash: z.string().min(1),
  declaredReference: z.string().nullable(),
}).passthrough();

const clusterSchema = z.object({
  id: z.string().min(1),
  relationship: z.enum(["MATCH", "SINGLETON", "AMBIGUOUS"]),
  recordIds: z.array(z.string().uuid()).min(1),
}).passthrough();

const detailSchema = z.object({
  currentVariantId: z.string().uuid(),
  canonicalKey: z.string().min(1),
  reference: z.string().nullable(),
  references: z.array(z.string()),
  identityClassification: z.enum(["MATCH", "DISTINCT", "AMBIGUOUS"]),
  sourceConsistency: z.enum(["CONSISTENT", "INCONSISTENT", "UNDETERMINED"]),
  safeAction: z.enum(["KEEP_MERGED", "SPLIT", "REVIEW"]),
  proposedClusters: z.array(clusterSchema).min(1),
  sourceRecords: z.array(sourceRecordSchema).min(1),
}).passthrough();

export const mergedRepairPlanSchema = z.object({
  dryRun: z.literal(true),
  variantsScanned: z.number().int().nonnegative(),
  sourceRecordsScanned: z.number().int().nonnegative(),
  variantsWithMultipleSourceRecords: z.number().int().nonnegative(),
  variantsSafeToSplit: z.number().int().nonnegative(),
  currentVariantCount: z.number().int().nonnegative(),
  predictedVariantCountAfterSafeSplits: z.number().int().nonnegative(),
  predictedNewVariants: z.number().int().nonnegative(),
  details: z.array(detailSchema),
}).passthrough();

export type MergedRepairPlan = z.infer<typeof mergedRepairPlanSchema>;
export type MergedRepairPlanDetail = MergedRepairPlan["details"][number];

const stableSort = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableSort(child)]),
  );
  return value;
};

export function repairPlanHash(plan: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableSort(plan))).digest("hex");
}

function sameMembers(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function validateMergedRepairPlan(input: unknown): MergedRepairPlan {
  const plan = mergedRepairPlanSchema.parse(input);
  const splitDetails = plan.details.filter((detail) => detail.safeAction === "SPLIT");
  if (splitDetails.length !== plan.variantsSafeToSplit) {
    throw new Error(`Plan SPLIT count mismatch: header=${plan.variantsSafeToSplit}, details=${splitDetails.length}`);
  }
  const variantIds = splitDetails.map((detail) => detail.currentVariantId);
  if (new Set(variantIds).size !== variantIds.length) throw new Error("Plan contains duplicate SPLIT variant IDs");

  const allSplitRecordIds: string[] = [];
  for (const detail of splitDetails) {
    if (detail.identityClassification !== "DISTINCT" || detail.sourceConsistency !== "CONSISTENT") {
      throw new Error(`Unsafe SPLIT detail ${detail.currentVariantId}: expected DISTINCT + CONSISTENT`);
    }
    if (detail.proposedClusters.length < 2) throw new Error(`SPLIT detail ${detail.currentVariantId} has fewer than two clusters`);
    if (detail.proposedClusters.some((cluster) => cluster.relationship === "AMBIGUOUS")) {
      throw new Error(`SPLIT detail ${detail.currentVariantId} contains an ambiguous cluster`);
    }
    const recordIds = detail.sourceRecords.map((record) => record.id);
    const clusteredIds = detail.proposedClusters.flatMap((cluster) => cluster.recordIds);
    if (new Set(recordIds).size !== recordIds.length || new Set(clusteredIds).size !== clusteredIds.length) {
      throw new Error(`SPLIT detail ${detail.currentVariantId} contains duplicate SourceRecord IDs`);
    }
    if (!sameMembers(recordIds, clusteredIds)) {
      throw new Error(`SPLIT detail ${detail.currentVariantId} cluster composition does not cover its SourceRecords exactly`);
    }
    allSplitRecordIds.push(...recordIds);
  }
  if (new Set(allSplitRecordIds).size !== allSplitRecordIds.length) throw new Error("A SourceRecord appears in multiple SPLIT groups");

  const predictedNewVariants = splitDetails.reduce((total, detail) => total + detail.proposedClusters.length - 1, 0);
  if (predictedNewVariants !== plan.predictedNewVariants) {
    throw new Error(`Plan new-variant count mismatch: header=${plan.predictedNewVariants}, clusters=${predictedNewVariants}`);
  }
  if (plan.predictedVariantCountAfterSafeSplits !== plan.currentVariantCount + plan.predictedNewVariants) {
    throw new Error("Plan predicted variant count is internally inconsistent");
  }
  return plan;
}

export async function loadMergedRepairPlan(path: string): Promise<MergedRepairPlan> {
  return validateMergedRepairPlan(JSON.parse(await readFile(path, "utf8")) as unknown);
}
