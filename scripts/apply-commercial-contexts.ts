import { createDatabaseClient } from "../src/db/client";
import { classifyCommercialContext } from "../lib/commercial-context";

const apply = process.argv.includes("--apply");
const db = createDatabaseClient();

try {
  const records = await db.sourceRecord.findMany({
    where: { variantId: { not: null } },
    orderBy: [{ sourceId: "asc" }, { externalId: "asc" }],
    select: { id: true, variantId: true, sourceId: true, sourceUrl: true, rawPayload: true, lastSeenAt: true },
  });
  const observations = records.flatMap((record) => {
    const raw = record.rawPayload && typeof record.rawPayload === "object" && !Array.isArray(record.rawPayload)
      ? (record.rawPayload as Record<string, unknown>).exclusive : null;
    if (typeof raw !== "string" || !raw.trim() || !record.variantId) return [];
    return [{ record, classification: classifyCommercialContext(raw, record.rawPayload) }];
  });

  const planned = {
    sourceRecords: observations.length,
    variants: new Set(observations.map(({ record }) => record.variantId)).size,
    contexts: new Set(observations.map(({ classification }) => `${classification.kind}:${classification.normalizedName}`)).size,
    byKind: Object.fromEntries([...new Set(observations.map(({ classification }) => classification.kind))].sort().map((kind) => [kind, new Set(observations.filter(({ classification }) => classification.kind === kind).map(({ record }) => record.variantId)).size])),
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...planned }, null, 2));
  } else {
    await db.$transaction(async (tx) => {
    for (const { record, classification } of observations) {
      const context = await tx.commercialContext.upsert({
        where: { kind_normalizedName: { kind: classification.kind, normalizedName: classification.normalizedName } },
        create: { kind: classification.kind, canonicalName: classification.canonicalName, normalizedName: classification.normalizedName },
        update: { canonicalName: classification.canonicalName },
      });
      await tx.commercialContextEvidence.upsert({
        where: { sourceRecordId: record.id },
        create: {
          contextId: context.id, variantId: record.variantId!, sourceId: record.sourceId, sourceRecordId: record.id,
          rawValue: classification.canonicalName, sourceUrl: record.sourceUrl, reason: classification.reason, observedAt: record.lastSeenAt,
        },
        update: {
          contextId: context.id, variantId: record.variantId!, sourceId: record.sourceId,
          rawValue: classification.canonicalName, sourceUrl: record.sourceUrl, reason: classification.reason, observedAt: record.lastSeenAt,
        },
      });
    }
    }, { timeout: 180_000 });

    const [contexts, evidence] = await Promise.all([db.commercialContext.count(), db.commercialContextEvidence.count()]);
    console.log(JSON.stringify({ mode: "apply", ...planned, persisted: { contexts, evidence } }, null, 2));
  }
} finally {
  await db.$disconnect();
}
