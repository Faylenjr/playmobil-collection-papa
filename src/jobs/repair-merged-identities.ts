import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { validateMergedRepairPlan, repairPlanHash, type MergedRepairPlan, type MergedRepairPlanDetail } from "../domain/merged-repair-plan.js";
import { parseReference } from "../domain/reference.js";
import { isGenericSourceMedia } from "../domain/source-media.js";
import { qualifiedIdentityKeys } from "../pipeline/canonical-identity.js";
import { rebuildCanonicalVariantFromSourceRecords, type RebuildSourceRecord } from "../pipeline/rebuild-canonical-variant.js";
import { auditMergedIdentities, type MergedIdentityAuditDetail } from "./audit-merged-identities.js";

const REPAIR_TRANSACTION_TIMEOUT_MS = 120_000;
const REPAIR_ADVISORY_LOCK = 7_074_337_231;
const REPAIR_LOCKED_TABLES = [
  "source_records", "source_values", "products", "product_variants", "product_references",
  "translations", "variant_translations", "themes", "product_themes", "variant_themes",
  "markets", "variant_markets", "media_assets", "instructions", "variant_figures", "variant_parts",
  "product_figures", "product_parts", "collection_items", "wishlist_items",
  "conflicts", "conflict_values", "review_tasks",
].join(", ");

type RepairReadClient = Pick<Prisma.TransactionClient,
  "sourceRecord" | "sourceValue" | "productVariant" | "product" | "conflict" | "reviewTask" | "mediaAsset" | "instruction"
>;

export interface MergedRepairExpectedCounts {
  planHash?: string;
  variantsToSplit?: number;
  clustersToMaterialize?: number;
  newVariants?: number;
  currentVariantCount?: number;
}

export interface MergedRepairOptions {
  apply?: boolean;
  expected?: MergedRepairExpectedCounts;
  /** Tests only: embedded PostgreSQL does not implement advisory locks. */
  skipAdvisoryLock?: boolean;
  /** Tests only: throws after a committed-in-memory group, before transaction commit. */
  afterGroup?: (completedGroups: number) => void | Promise<void>;
}

export interface RelationAttributionBlocker {
  currentVariantId: string;
  relation: "MediaAsset" | "Instruction" | "VariantFigure" | "VariantPart" | "ProductFigure" | "ProductPart" | "CollectionItem" | "WishlistItem";
  count: number;
  reason: string;
}

export interface MergedRepairReport {
  dryRun: boolean;
  planValidated: true;
  planHash: string;
  alreadyApplied: boolean;
  identitySafeSplits: number;
  eligibleSplits: number;
  blockedSplits: number;
  appliedSplits: number;
  eligibleNewVariants: number;
  variantsToSplit: number;
  clustersToMaterialize: number;
  newVariantsPlanned: number;
  currentVariantCount: number;
  predictedVariantCount: number;
  predictedVariantCountAfterApply: number;
  resultingVariantCount: number | null;
  sourceRecordsToMove: number;
  sourceValuesToReassign: number;
  conflictsExpectedToResolve: number;
  reviewTasksExpectedToChange: number;
  canonicalRekeysPlanned: number;
  mediaAssetsToMove: number;
  instructionsToMove: number;
  genericMediaIgnored: number;
  relationAttributionBlockers: RelationAttributionBlocker[];
  groups: MergedRepairGroupReport[];
  applyBlocked: boolean;
  variantsCreated: number;
  productsCreated: number;
  sourceRecordsMoved: number;
  sourceValuesReassigned: number;
  conflictsResolved: number;
  conflictsCreated: number;
  canonicalRekeysApplied: number;
}

export interface UnattributableRelationCounts {
  mediaAssets: number;
  instructions: number;
  variantFigures: number;
  variantParts: number;
  productFigures: number;
  productParts: number;
  collectionItems: number;
  wishlistItems: number;
}

export interface MergedRepairGroupReport {
  currentVariantId: string;
  canonicalKey: string;
  clusters: number;
  state: "PENDING" | "APPLIED";
  identityClassification: "DISTINCT";
  sourceConsistency: "CONSISTENT";
  safeAction: "SPLIT";
  relationAttribution: "COMPLETE" | "INCOMPLETE";
  applyEligibility: "ELIGIBLE" | "BLOCKED_UNATTRIBUTED_RELATIONS";
  unattributableRelations: UnattributableRelationCounts;
  eligibleNewVariants: number;
  genericMediaIgnored: number;
}

interface ExpectedCluster {
  id: string;
  recordIds: string[];
  records: CurrentSourceRecord[];
  keys: { productKey: string; variantKey: string };
  stableAnchor: string;
  retainsVariantId: boolean;
  targetVariantId: string | null;
}

interface ExpectedGroup {
  plan: MergedRepairPlanDetail;
  clusters: ExpectedCluster[];
  state: "PENDING" | "APPLIED";
  blockers: RelationAttributionBlocker[];
  mediaAssignments: RelationAssignment[];
  instructionAssignments: RelationAssignment[];
  genericMediaIgnored: number;
}

interface CurrentSourceRecord extends RebuildSourceRecord {
  variantId: string | null;
  externalId: string;
  contentHash: string;
}

interface RelationAssignment {
  id: string;
  currentVariantId: string;
  targetClusterId: string;
}

interface RepairInspection {
  currentVariantCount: number;
  groups: ExpectedGroup[];
  blockers: RelationAttributionBlocker[];
  mediaAssignments: RelationAssignment[];
  instructionAssignments: RelationAssignment[];
  sourceRecordsToMove: number;
  sourceValuesToReassign: number;
  conflictsExpectedToResolve: number;
  canonicalRekeysPlanned: number;
  eligibleNewVariants: number;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const sameMembers = (left: string[], right: string[]) => {
  const a = [...left].sort(compareText); const b = [...right].sort(compareText);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

function splitDetails(plan: MergedRepairPlan): MergedRepairPlanDetail[] {
  return plan.details.filter((detail) => detail.safeAction === "SPLIT").sort((left, right) => compareText(left.currentVariantId, right.currentVariantId));
}

function assertExpectedCounts(plan: MergedRepairPlan, expected: MergedRepairExpectedCounts = {}): void {
  if (expected.planHash !== undefined && expected.planHash.toLowerCase() !== repairPlanHash(plan)) {
    throw new Error(`Expected planHash=${expected.planHash.toLowerCase()}, actual=${repairPlanHash(plan)}`);
  }
  const details = splitDetails(plan);
  const clusters = details.reduce((total, detail) => total + detail.proposedClusters.length, 0);
  const checks: Array<[string, number | undefined, number]> = [
    ["variantsToSplit", expected.variantsToSplit, details.length],
    ["clustersToMaterialize", expected.clustersToMaterialize, clusters],
    ["newVariants", expected.newVariants, plan.predictedNewVariants],
    ["currentVariantCount", expected.currentVariantCount, plan.currentVariantCount],
  ];
  for (const [label, wanted, actual] of checks) if (wanted !== undefined && wanted !== actual) {
    throw new Error(`Expected ${label}=${wanted}, plan contains ${actual}`);
  }
}

function clusterSignature(clusters: Array<{ recordIds: string[] }>): string[] {
  return clusters.map((cluster) => [...cluster.recordIds].sort(compareText).join("\0")).sort(compareText);
}

function assertCurrentAuditMatchesPlan(planDetail: MergedRepairPlanDetail, current: MergedIdentityAuditDetail | undefined): void {
  if (!current) throw new Error(`Drift detected: variant ${planDetail.currentVariantId} is no longer a merged audit group`);
  if (current.identityClassification !== "DISTINCT" || current.sourceConsistency !== "CONSISTENT" || current.safeAction !== "SPLIT") {
    throw new Error(`Drift detected: variant ${planDetail.currentVariantId} is now ${current.identityClassification}/${current.sourceConsistency}/${current.safeAction}`);
  }
  const expected = clusterSignature(planDetail.proposedClusters);
  const actual = clusterSignature(current.proposedClusters);
  if (!sameMembers(expected, actual)) throw new Error(`Drift detected: cluster composition changed for ${planDetail.currentVariantId}`);
}

function referenceForCluster(detail: MergedRepairPlanDetail, records: CurrentSourceRecord[]): ReturnType<typeof parseReference> {
  const planned = new Map(detail.sourceRecords.map((record) => [record.id, record]));
  const references = [...new Set(records.map((record) => planned.get(record.id)?.declaredReference).filter((value): value is string => Boolean(value)))];
  if (references.length === 0 && detail.reference) references.push(detail.reference);
  if (references.length === 0) throw new Error(`No declared reference for cluster in ${detail.currentVariantId}`);
  const parsed = references.map(parseReference);
  if (new Set(parsed.map((reference) => reference.normalized)).size !== 1) {
    throw new Error(`Cluster in ${detail.currentVariantId} contains multiple normalized references`);
  }
  return parsed[0]!;
}

function relationTargetBySource(groups: ExpectedCluster[]): Map<string, string | null> {
  const sourceClusters = new Map<string, Set<string>>();
  for (const cluster of groups) for (const record of cluster.records) {
    const clusters = sourceClusters.get(record.sourceId) ?? new Set<string>();
    clusters.add(cluster.id);
    sourceClusters.set(record.sourceId, clusters);
  }
  return new Map([...sourceClusters].map(([sourceId, clusters]) => [sourceId, clusters.size === 1 ? [...clusters][0]! : null]));
}

async function inspectRepairState(
  db: RepairReadClient,
  plan: MergedRepairPlan,
  requireAuditMatch: boolean,
): Promise<RepairInspection> {
  const details = splitDetails(plan);
  const plannedRecords = details.flatMap((detail) => detail.sourceRecords);
  const recordIds = plannedRecords.map((record) => record.id);
  const [currentVariantCount, currentRecords, variants, currentAudit] = await Promise.all([
    db.productVariant.count(),
    db.sourceRecord.findMany({
      where: { id: { in: recordIds } },
      include: {
        source: { select: { key: true } },
        values: {
          where: { entityType: "ProductVariant" },
          include: { source: { select: { key: true } } },
          orderBy: [{ field: "asc" }, { retrievedAt: "desc" }],
        },
      },
    }),
    db.productVariant.findMany({
      where: { id: { in: details.map((detail) => detail.currentVariantId) } },
      select: {
        id: true, productId: true, canonicalKey: true,
        product: { select: { id: true, canonicalKey: true, _count: { select: { variants: true, figures: true, parts: true } } } },
        media: { select: { id: true, sourceId: true, sourceUrl: true } },
        instructions: { select: { id: true, sourceId: true } },
        figures: { select: { figureId: true } },
        parts: { select: { partId: true } },
        collectionItems: { select: { id: true } },
        wishlistItems: { select: { id: true } },
      },
    }),
    requireAuditMatch ? auditMergedIdentities(db) : Promise.resolve(null),
  ]);
  if (currentRecords.length !== recordIds.length) throw new Error(`Drift detected: expected ${recordIds.length} SourceRecords, found ${currentRecords.length}`);
  const currentById = new Map(currentRecords.map((record) => [record.id, record as CurrentSourceRecord]));
  const plannedById = new Map(plannedRecords.map((record) => [record.id, record]));
  for (const [id, planned] of plannedById) {
    const current = currentById.get(id);
    if (!current) throw new Error(`Drift detected: missing SourceRecord ${id}`);
    if (current.externalId !== planned.externalId) throw new Error(`Drift detected: externalId changed for SourceRecord ${id}`);
    if (current.contentHash !== planned.contentHash) throw new Error(`Drift detected: contentHash changed for SourceRecord ${id}`);
    if (current.source.key !== planned.sourceKey) throw new Error(`Drift detected: source changed for SourceRecord ${id}`);
  }

  const expectedGroups: ExpectedGroup[] = details.map((detail) => {
    const clusters: ExpectedCluster[] = detail.proposedClusters.map((plannedCluster): ExpectedCluster => {
      const records = plannedCluster.recordIds.map((id) => currentById.get(id)!);
      const reference = referenceForCluster(detail, records);
      const keys = qualifiedIdentityKeys(reference.base, reference.normalized, records.map((record) => ({ sourceKey: record.source.key, externalId: record.externalId })));
      const anchor = records
        .map((record) => `${record.source.key}\0${record.externalId}`)
        .sort(compareText)[0]!;
      return { id: plannedCluster.id, recordIds: [...plannedCluster.recordIds].sort(compareText), records, keys, stableAnchor: anchor, retainsVariantId: false, targetVariantId: null };
    }).sort((left, right) => compareText(left.stableAnchor, right.stableAnchor));
    clusters[0]!.retainsVariantId = true;
    clusters[0]!.targetVariantId = detail.currentVariantId;
    return { plan: detail, clusters, state: "PENDING", blockers: [], mediaAssignments: [], instructionAssignments: [], genericMediaIgnored: 0 };
  });

  const expectedVariantKeys = expectedGroups.flatMap((group) => group.clusters.map((cluster) => cluster.keys.variantKey));
  const targetVariants = await db.productVariant.findMany({
    where: { canonicalKey: { in: expectedVariantKeys } },
    select: { id: true, canonicalKey: true },
  });
  const targetByKey = new Map(targetVariants.map((variant) => [variant.canonicalKey, variant.id]));
  for (const group of expectedGroups) for (const cluster of group.clusters) {
    if (!cluster.retainsVariantId) cluster.targetVariantId = targetByKey.get(cluster.keys.variantKey) ?? null;
  }

  for (const group of expectedGroups) {
    const pending = group.clusters.every((cluster) => cluster.records.every((record) => record.variantId === group.plan.currentVariantId));
    const applied = group.clusters.every((cluster) => {
      const expectedId = cluster.retainsVariantId ? group.plan.currentVariantId : cluster.targetVariantId;
      return Boolean(expectedId) && cluster.records.every((record) => record.variantId === expectedId);
    });
    if (!pending && !applied) throw new Error(`Drift detected: group ${group.plan.currentVariantId} is partially applied or its SourceRecords moved unexpectedly`);
    group.state = applied ? "APPLIED" : "PENDING";
    if (applied) for (const cluster of group.clusters) {
      const targetId = cluster.retainsVariantId ? group.plan.currentVariantId : cluster.targetVariantId;
      const target = targetVariants.find((variant) => variant.id === targetId)
        ?? (cluster.retainsVariantId ? variants.find((variant) => variant.id === targetId) : undefined);
      if (!target || target.canonicalKey !== cluster.keys.variantKey) throw new Error(`Drift detected: repaired canonical key missing for cluster ${cluster.id}`);
    }
    if (pending) for (const cluster of group.clusters) {
      if (!cluster.retainsVariantId && cluster.targetVariantId) throw new Error(`Canonical variant key collision: ${cluster.keys.variantKey}`);
    }
  }

  const appliedNewVariants = expectedGroups
    .filter((group) => group.state === "APPLIED")
    .reduce((total, group) => total + group.clusters.length - 1, 0);
  const expectedCurrentVariantCount = plan.currentVariantCount + appliedNewVariants;
  if (currentVariantCount !== expectedCurrentVariantCount) {
    throw new Error(`Drift detected: current ProductVariant count ${currentVariantCount}, expected ${expectedCurrentVariantCount} for this plan state`);
  }
  if (requireAuditMatch && currentAudit) {
    const detailsById = new Map(currentAudit.details.map((detail) => [detail.currentVariantId, detail]));
    for (const group of expectedGroups.filter((candidate) => candidate.state === "PENDING")) {
      assertCurrentAuditMatchesPlan(group.plan, detailsById.get(group.plan.currentVariantId));
    }
  }

  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
  const blockers: RelationAttributionBlocker[] = [];
  for (const group of expectedGroups.filter((candidate) => candidate.state === "PENDING")) {
    const current = variantsById.get(group.plan.currentVariantId);
    if (!current) throw new Error(`Drift detected: missing ProductVariant ${group.plan.currentVariantId}`);
    const targetBySource = relationTargetBySource(group.clusters);
    for (const media of current.media) {
      if (isGenericSourceMedia(media.sourceUrl)) {
        group.genericMediaIgnored += 1;
        continue;
      }
      const clusterId = targetBySource.get(media.sourceId);
      if (clusterId) {
        const assignment = { id: media.id, currentVariantId: current.id, targetClusterId: clusterId };
        group.mediaAssignments.push(assignment);
      } else group.blockers.push({ currentVariantId: current.id, relation: "MediaAsset", count: 1, reason: "Its Source is represented in multiple clusters; no SourceRecord provenance exists." });
    }
    for (const instruction of current.instructions) {
      const clusterId = targetBySource.get(instruction.sourceId);
      if (clusterId) {
        const assignment = { id: instruction.id, currentVariantId: current.id, targetClusterId: clusterId };
        group.instructionAssignments.push(assignment);
      } else group.blockers.push({ currentVariantId: current.id, relation: "Instruction", count: 1, reason: "Its Source is represented in multiple clusters; no SourceRecord provenance exists." });
    }
    const unscoped: Array<[RelationAttributionBlocker["relation"], number, string]> = [
      ["VariantFigure", current.figures.length, "VariantFigure has no SourceRecord provenance."],
      ["VariantPart", current.parts.length, "VariantPart has no SourceRecord provenance."],
      ["ProductFigure", current.product._count.figures, "ProductFigure has no SourceRecord provenance."],
      ["ProductPart", current.product._count.parts, "ProductPart has no SourceRecord provenance."],
      ["CollectionItem", current.collectionItems.length, "A collection item cannot be assigned to a split object automatically."],
      ["WishlistItem", current.wishlistItems.length, "A wishlist item cannot be assigned to a split object automatically."],
    ];
    for (const [relation, count, reason] of unscoped) if (count > 0) group.blockers.push({ currentVariantId: current.id, relation, count, reason });
    blockers.push(...group.blockers);
  }

  const compactBlockers = [...new Map(blockers.map((blocker) => [`${blocker.currentVariantId}\0${blocker.relation}`, blocker])).values()]
    .map((blocker) => ({
      ...blocker,
      count: blockers.filter((candidate) => candidate.currentVariantId === blocker.currentVariantId && candidate.relation === blocker.relation)
        .reduce((total, candidate) => total + candidate.count, 0),
    }))
    .sort((left, right) => compareText(`${left.currentVariantId}\0${left.relation}`, `${right.currentVariantId}\0${right.relation}`));
  const eligibleGroups = expectedGroups.filter((group) => group.state === "PENDING" && group.blockers.length === 0);
  const nonAnchorRecords = eligibleGroups.flatMap((group) => group.clusters.filter((cluster) => !cluster.retainsVariantId).flatMap((cluster) => cluster.records));
  const conflictsExpectedToResolve = await db.conflict.count({
    where: { entityType: "ProductVariant", entityId: { in: eligibleGroups.map((group) => group.plan.currentVariantId) }, status: "OPEN" },
  });
  return {
    currentVariantCount,
    groups: expectedGroups,
    blockers: compactBlockers,
    mediaAssignments: eligibleGroups.flatMap((group) => group.mediaAssignments),
    instructionAssignments: eligibleGroups.flatMap((group) => group.instructionAssignments),
    sourceRecordsToMove: nonAnchorRecords.length,
    sourceValuesToReassign: nonAnchorRecords.reduce((total, record) => total + record.values.length, 0),
    conflictsExpectedToResolve,
    canonicalRekeysPlanned: eligibleGroups.reduce((total, group) => total + group.clusters.length, 0),
    eligibleNewVariants: eligibleGroups.reduce((total, group) => total + group.clusters.length - 1, 0),
  };
}

function baseReport(plan: MergedRepairPlan, inspection: RepairInspection, apply: boolean): MergedRepairReport {
  const details = splitDetails(plan);
  const eligibleGroups = inspection.groups.filter((group) => group.state === "PENDING" && group.blockers.length === 0);
  const blockedGroups = inspection.groups.filter((group) => group.state === "PENDING" && group.blockers.length > 0);
  const appliedGroups = inspection.groups.filter((group) => group.state === "APPLIED");
  const relationCounts = (group: ExpectedGroup): UnattributableRelationCounts => {
    const count = (relation: RelationAttributionBlocker["relation"]) => group.blockers
      .filter((blocker) => blocker.relation === relation)
      .reduce((total, blocker) => total + blocker.count, 0);
    return {
      mediaAssets: count("MediaAsset"), instructions: count("Instruction"),
      variantFigures: count("VariantFigure"), variantParts: count("VariantPart"),
      productFigures: count("ProductFigure"), productParts: count("ProductPart"),
      collectionItems: count("CollectionItem"), wishlistItems: count("WishlistItem"),
    };
  };
  const groups: MergedRepairGroupReport[] = inspection.groups.map((group) => ({
    currentVariantId: group.plan.currentVariantId,
    canonicalKey: group.plan.canonicalKey,
    clusters: group.clusters.length,
    state: group.state,
    identityClassification: "DISTINCT",
    sourceConsistency: "CONSISTENT",
    safeAction: "SPLIT",
    relationAttribution: group.blockers.length === 0 ? "COMPLETE" : "INCOMPLETE",
    applyEligibility: group.blockers.length === 0 ? "ELIGIBLE" : "BLOCKED_UNATTRIBUTED_RELATIONS",
    unattributableRelations: relationCounts(group),
    eligibleNewVariants: group.state === "PENDING" && group.blockers.length === 0 ? group.clusters.length - 1 : 0,
    genericMediaIgnored: group.genericMediaIgnored,
  }));
  const eligibleClusters = eligibleGroups.reduce((total, group) => total + group.clusters.length, 0);
  const allApplied = appliedGroups.length === details.length;
  return {
    dryRun: !apply,
    planValidated: true,
    planHash: repairPlanHash(plan),
    alreadyApplied: allApplied,
    identitySafeSplits: details.length,
    eligibleSplits: eligibleGroups.length,
    blockedSplits: blockedGroups.length,
    appliedSplits: appliedGroups.length,
    eligibleNewVariants: inspection.eligibleNewVariants,
    variantsToSplit: eligibleGroups.length,
    clustersToMaterialize: eligibleClusters,
    newVariantsPlanned: inspection.eligibleNewVariants,
    currentVariantCount: inspection.currentVariantCount,
    predictedVariantCount: inspection.currentVariantCount + inspection.eligibleNewVariants,
    predictedVariantCountAfterApply: inspection.currentVariantCount + inspection.eligibleNewVariants,
    resultingVariantCount: allApplied ? inspection.currentVariantCount : null,
    sourceRecordsToMove: inspection.sourceRecordsToMove,
    sourceValuesToReassign: inspection.sourceValuesToReassign,
    conflictsExpectedToResolve: inspection.conflictsExpectedToResolve,
    reviewTasksExpectedToChange: 0,
    canonicalRekeysPlanned: inspection.canonicalRekeysPlanned,
    mediaAssetsToMove: inspection.mediaAssignments.length,
    instructionsToMove: inspection.instructionAssignments.length,
    genericMediaIgnored: inspection.groups.reduce((total, group) => total + group.genericMediaIgnored, 0),
    relationAttributionBlockers: inspection.blockers,
    groups,
    applyBlocked: eligibleGroups.length === 0 && blockedGroups.length > 0,
    variantsCreated: 0,
    productsCreated: 0,
    sourceRecordsMoved: 0,
    sourceValuesReassigned: 0,
    conflictsResolved: 0,
    conflictsCreated: 0,
    canonicalRekeysApplied: 0,
  };
}

async function createProductForCluster(
  tx: Prisma.TransactionClient,
  group: ExpectedGroup,
  cluster: ExpectedCluster,
  oldProduct: { id: string; canonicalKey: string; variantCount: number },
): Promise<{ productId: string; created: boolean }> {
  if (cluster.retainsVariantId && oldProduct.variantCount === 1) return { productId: oldProduct.id, created: false };
  const existing = await tx.product.findUnique({ where: { canonicalKey: cluster.keys.productKey }, select: { id: true } });
  if (existing) throw new Error(`Canonical product key collision: ${cluster.keys.productKey}`);
  const plannedReference = referenceForCluster(group.plan, cluster.records);
  const product = await tx.product.create({ data: {
    canonicalKey: cluster.keys.productKey,
    baseReference: plannedReference.base,
    kind: "UNKNOWN",
  } });
  return { productId: product.id, created: true };
}

export async function repairMergedIdentities(
  db: PrismaClient,
  inputPlan: unknown,
  options: MergedRepairOptions = {},
): Promise<MergedRepairReport> {
  const plan = validateMergedRepairPlan(inputPlan);
  assertExpectedCounts(plan, options.expected);
  const initial = await inspectRepairState(db, plan, true);
  const preview = baseReport(plan, initial, Boolean(options.apply));
  if (!options.apply || initial.groups.every((group) => group.state === "APPLIED")) return preview;
  if (initial.eligibleNewVariants === 0) return { ...preview, resultingVariantCount: initial.currentVariantCount };

  const performed = await db.$transaction(async (tx) => {
    if (!options.skipAdvisoryLock) {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${REPAIR_ADVISORY_LOCK})`);
      // The advisory lock coordinates future maintenance jobs. The table lock
      // also blocks an importer that does not yet participate in that protocol.
      await tx.$executeRawUnsafe(`LOCK TABLE ${REPAIR_LOCKED_TABLES} IN SHARE ROW EXCLUSIVE MODE`);
    }
    const inspection = await inspectRepairState(tx, plan, true);
    const eligibleGroups = inspection.groups.filter((group) => group.state === "PENDING" && group.blockers.length === 0);
    if (eligibleGroups.length === 0) return { report: { ...baseReport(plan, inspection, true), resultingVariantCount: inspection.currentVariantCount } };

    const targetVariantByCluster = new Map<string, string>();
    let variantsCreated = 0;
    let productsCreated = 0;
    let sourceRecordsMoved = 0;
    let sourceValuesReassigned = 0;
    let conflictsResolved = 0;
    let conflictsCreated = 0;
    let canonicalRekeysApplied = 0;
    let completedGroups = 0;

    for (const group of eligibleGroups) {
      const current = await tx.productVariant.findUniqueOrThrow({
        where: { id: group.plan.currentVariantId },
        select: { productId: true, product: { select: { id: true, canonicalKey: true, _count: { select: { variants: true } } } } },
      });
      const oldProduct = { id: current.product.id, canonicalKey: current.product.canonicalKey, variantCount: current.product._count.variants };
      for (const cluster of group.clusters) {
        const product = await createProductForCluster(tx, group, cluster, oldProduct);
        if (product.created) productsCreated += 1;
        let variantId = group.plan.currentVariantId;
        if (!cluster.retainsVariantId) {
          const existing = await tx.productVariant.findUnique({ where: { canonicalKey: cluster.keys.variantKey }, select: { id: true } });
          if (existing) throw new Error(`Canonical variant key collision: ${cluster.keys.variantKey}`);
          const created = await tx.productVariant.create({ data: {
            productId: product.productId,
            canonicalKey: cluster.keys.variantKey,
            name: null,
          } });
          variantId = created.id;
          variantsCreated += 1;
        }
        targetVariantByCluster.set(`${group.plan.currentVariantId}\0${cluster.id}`, variantId);
        cluster.targetVariantId = variantId;
      }

      const oldConflictResult = await tx.conflict.updateMany({
        where: { entityType: "ProductVariant", entityId: group.plan.currentVariantId, status: "OPEN" },
        data: {
          status: "AUTO_RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: "resolved-by-merged-variant-split",
        },
      });
      conflictsResolved += oldConflictResult.count;

      for (const cluster of group.clusters) {
        const variantId = cluster.targetVariantId!;
        const moved = await tx.sourceRecord.updateMany({
          where: { id: { in: cluster.recordIds }, variantId: group.plan.currentVariantId },
          data: { variantId },
        });
        if (!cluster.retainsVariantId && moved.count !== cluster.recordIds.length) throw new Error(`SourceRecord move count mismatch for ${cluster.id}`);
        sourceRecordsMoved += cluster.retainsVariantId ? 0 : moved.count;
        const reassigned = await tx.sourceValue.updateMany({
          where: { sourceRecordId: { in: cluster.recordIds }, entityType: "ProductVariant", entityId: group.plan.currentVariantId },
          data: { entityId: variantId, isSelected: false },
        });
        if (!cluster.retainsVariantId) sourceValuesReassigned += reassigned.count;
        const productId = (await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { productId: true } })).productId;
        const rebuilt = await rebuildCanonicalVariantFromSourceRecords(tx, {
          variantId,
          productId,
          keys: cluster.keys,
          records: cluster.records,
          identityReason: "validated-merged-variant-split",
        });
        conflictsCreated += rebuilt.conflictsCreated;
        canonicalRekeysApplied += 1;
      }

      for (const assignment of group.mediaAssignments) {
        const variantId = targetVariantByCluster.get(`${group.plan.currentVariantId}\0${assignment.targetClusterId}`);
        if (variantId) await tx.mediaAsset.update({ where: { id: assignment.id }, data: { variantId } });
      }
      for (const assignment of group.instructionAssignments) {
        const variantId = targetVariantByCluster.get(`${group.plan.currentVariantId}\0${assignment.targetClusterId}`);
        if (variantId) await tx.instruction.update({ where: { id: assignment.id }, data: { variantId } });
      }
      completedGroups += 1;
      await options.afterGroup?.(completedGroups);
    }

    const finalCount = await tx.productVariant.count();
    const expectedFinalCount = inspection.currentVariantCount + inspection.eligibleNewVariants;
    if (finalCount !== expectedFinalCount) {
      throw new Error(`Post-repair ProductVariant count ${finalCount}, expected ${expectedFinalCount}`);
    }
    return {
      report: {
        ...baseReport(plan, inspection, true),
        predictedVariantCount: finalCount,
        predictedVariantCountAfterApply: finalCount,
        resultingVariantCount: finalCount,
        variantsCreated,
        productsCreated,
        sourceRecordsMoved,
        sourceValuesReassigned,
        conflictsResolved,
        conflictsCreated,
        canonicalRekeysApplied,
      },
    };
  }, { timeout: REPAIR_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 });
  return performed.report;
}
