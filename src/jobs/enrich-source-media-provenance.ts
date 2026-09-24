import type { PrismaClient } from "../../generated/prisma/client.js";
import { validateMergedRepairPlan, type MergedRepairPlan } from "../domain/merged-repair-plan.js";
import { isGenericSourceMedia } from "../domain/source-media.js";
import { PoliteHttpClient } from "../importers/http.js";
import { parseKlickypediaMedia } from "../importers/klickypedia.js";
import { repairMergedIdentities } from "./repair-merged-identities.js";

export interface SourceMediaFetcher {
  get(url: string): Promise<{ body: string; status: number; hash: string }>;
}

export interface EnrichSourceMediaOptions {
  apply?: boolean;
  client?: SourceMediaFetcher;
}

interface PendingObservation {
  sourceRecordId: string;
  sourceUrl: string;
  kind: string;
  observedAt: Date;
  pageContentHash: string;
}

export interface SourceMediaEnrichmentReport {
  dryRun: boolean;
  sourceRecordsTargeted: number;
  pagesFetched: number;
  pagesFailed: number;
  observationsFound: number;
  observationsCreated: number;
  existingObservations: number;
  existingBlockedMedia: number;
  mediaMatchedToAtLeastOneSourceRecord: number;
  mediaStillUnattributable: number;
  newMediaObserved: number;
  groupsPotentiallyUnblocked: number;
  details: Array<{
    currentVariantId: string;
    canonicalKey: string;
    sourceRecordsTargeted: number;
    existingMedia: number;
    mediaMatched: number;
    mediaStillUnattributable: number;
    newMediaObserved: number;
    potentiallyUnblocked: boolean;
    records: Array<{
      sourceRecordId: string;
      sourceUrl: string;
      status: "FETCHED" | "FAILED";
      observationsFound: number;
      error?: string;
    }>;
  }>;
}

const observationKey = (observation: { sourceRecordId: string; sourceUrl: string; kind: string }) =>
  `${observation.sourceRecordId}\0${observation.sourceUrl}\0${observation.kind}`;

export async function enrichSourceMediaProvenance(
  db: PrismaClient,
  inputPlan: unknown,
  options: EnrichSourceMediaOptions = {},
): Promise<SourceMediaEnrichmentReport> {
  const plan: MergedRepairPlan = validateMergedRepairPlan(inputPlan);
  const repairPreview = await repairMergedIdentities(db, plan);
  const blockedIds = new Set(repairPreview.groups
    .filter((group) => group.state === "PENDING" && group.safeAction === "SPLIT" && group.applyEligibility === "BLOCKED_UNATTRIBUTED_RELATIONS")
    .map((group) => group.currentVariantId));
  const blockedDetails = plan.details.filter((detail) => blockedIds.has(detail.currentVariantId));
  const plannedRecordIds = blockedDetails.flatMap((detail) => detail.sourceRecords
    .filter((record) => record.sourceKey === "klickypedia")
    .map((record) => record.id));
  const records = await db.sourceRecord.findMany({
    where: { id: { in: plannedRecordIds }, source: { key: "klickypedia" } },
    select: { id: true, sourceUrl: true, externalId: true, contentHash: true, source: { select: { key: true } } },
    orderBy: [{ sourceUrl: "asc" }, { id: "asc" }],
  });
  if (records.length !== plannedRecordIds.length) {
    throw new Error(`Drift detected: expected ${plannedRecordIds.length} targeted Klickypedia SourceRecords, found ${records.length}`);
  }

  const client = options.client ?? new PoliteHttpClient();
  const fetchedAt = new Date();
  const pending = new Map<string, PendingObservation>();
  const recordResults = new Map<string, {
    sourceRecordId: string;
    sourceUrl: string;
    status: "FETCHED" | "FAILED";
    observationsFound: number;
    error?: string;
  }>();
  let pagesFetched = 0;
  let pagesFailed = 0;
  for (const record of records) {
    try {
      const response = await client.get(record.sourceUrl);
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      const images = parseKlickypediaMedia(response.body, record.sourceUrl)
        .filter((image) => !isGenericSourceMedia(image.url));
      for (const image of images) {
        const observation = {
          sourceRecordId: record.id,
          sourceUrl: image.url,
          kind: image.kind,
          observedAt: fetchedAt,
          pageContentHash: response.hash,
        };
        pending.set(observationKey(observation), observation);
      }
      pagesFetched += 1;
      recordResults.set(record.id, {
        sourceRecordId: record.id,
        sourceUrl: record.sourceUrl,
        status: "FETCHED",
        observationsFound: images.length,
      });
    } catch (error) {
      pagesFailed += 1;
      recordResults.set(record.id, {
        sourceRecordId: record.id,
        sourceUrl: record.sourceUrl,
        status: "FAILED",
        observationsFound: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const existing = await db.sourceMediaObservation.findMany({
    where: { sourceRecordId: { in: plannedRecordIds } },
    select: { sourceRecordId: true, sourceUrl: true, kind: true },
  });
  const combined = new Map(existing.map((observation) => [observationKey(observation), observation]));
  for (const [key, observation] of pending) combined.set(key, observation);

  let observationsCreated = 0;
  if (options.apply && pending.size > 0) {
    const created = await db.sourceMediaObservation.createMany({ data: [...pending.values()], skipDuplicates: true });
    observationsCreated = created.count;
  }

  const assets = await db.mediaAsset.findMany({
    where: { variantId: { in: [...blockedIds] } },
    select: { id: true, variantId: true, sourceUrl: true },
  });
  const realAssets = assets.filter((asset) => !isGenericSourceMedia(asset.sourceUrl));
  let matchedMedia = 0;
  let unattributableMedia = 0;
  let newMediaObserved = 0;
  let groupsPotentiallyUnblocked = 0;
  const details = blockedDetails.map((detail) => {
    const recordIds = new Set(detail.sourceRecords.filter((record) => record.sourceKey === "klickypedia").map((record) => record.id));
    const groupObservations = [...combined.values()].filter((observation) => recordIds.has(observation.sourceRecordId));
    const observedUrls = new Set(groupObservations.map((observation) => observation.sourceUrl));
    const groupAssets = realAssets.filter((asset) => asset.variantId === detail.currentVariantId);
    const mediaMatched = groupAssets.filter((asset) => observedUrls.has(asset.sourceUrl)).length;
    const stillUnattributable = groupAssets.length - mediaMatched;
    const assetUrls = new Set(groupAssets.map((asset) => asset.sourceUrl));
    const groupNewMedia = new Set(groupObservations.filter((observation) => !assetUrls.has(observation.sourceUrl)).map((observation) => observation.sourceUrl)).size;
    const repairGroup = repairPreview.groups.find((group) => group.currentVariantId === detail.currentVariantId)!;
    const nonMediaBlockers = Object.entries(repairGroup.unattributableRelations)
      .filter(([key]) => key !== "mediaAssets")
      .reduce((total, [, count]) => total + count, 0);
    const potentiallyUnblocked = stillUnattributable === 0 && nonMediaBlockers === 0;
    matchedMedia += mediaMatched;
    unattributableMedia += stillUnattributable;
    newMediaObserved += groupNewMedia;
    if (potentiallyUnblocked) groupsPotentiallyUnblocked += 1;
    return {
      currentVariantId: detail.currentVariantId,
      canonicalKey: detail.canonicalKey,
      sourceRecordsTargeted: recordIds.size,
      existingMedia: groupAssets.length,
      mediaMatched,
      mediaStillUnattributable: stillUnattributable,
      newMediaObserved: groupNewMedia,
      potentiallyUnblocked,
      records: [...recordIds].map((id) => recordResults.get(id)!).filter(Boolean),
    };
  });

  return {
    dryRun: !options.apply,
    sourceRecordsTargeted: records.length,
    pagesFetched,
    pagesFailed,
    observationsFound: pending.size,
    observationsCreated,
    existingObservations: existing.length,
    existingBlockedMedia: realAssets.length,
    mediaMatchedToAtLeastOneSourceRecord: matchedMedia,
    mediaStillUnattributable: unattributableMedia,
    newMediaObserved,
    groupsPotentiallyUnblocked,
    details,
  };
}
