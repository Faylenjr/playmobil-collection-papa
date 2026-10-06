import { createDatabaseClient } from "../src/db/client";
import { classifyCommercialContext, commercialContextLabels } from "../lib/commercial-context";

const db = createDatabaseClient();

try {
  const records = await db.sourceRecord.findMany({
    where: { variantId: { not: null } },
    orderBy: [{ source: { key: "asc" } }, { externalId: "asc" }],
    select: {
      id: true, variantId: true, sourceUrl: true, rawPayload: true, firstSeenAt: true, lastSeenAt: true,
      source: { select: { key: true, name: true, kind: true } },
      variant: {
        select: {
          productId: true,
          references: { orderBy: { displayValue: "asc" }, take: 1, select: { displayValue: true } },
          markets: { select: { market: { select: { code: true } } } },
        },
      },
    },
  });

  const observations = records.flatMap((record) => {
    const raw = record.rawPayload && typeof record.rawPayload === "object" && !Array.isArray(record.rawPayload)
      ? (record.rawPayload as Record<string, unknown>).exclusive : null;
    if (typeof raw !== "string" || !raw.trim() || !record.variantId || !record.variant) return [];
    return [{ record, classification: classifyCommercialContext(raw, record.rawPayload) }];
  });

  const categoryStats = Object.keys(commercialContextLabels).map((kind) => {
    const matching = observations.filter(({ classification }) => classification.kind === kind);
    const counts = new Map<string, Set<string>>();
    for (const { record, classification } of matching) {
      const variants = counts.get(classification.canonicalName) ?? new Set<string>();
      variants.add(record.variantId!);
      counts.set(classification.canonicalName, variants);
    }
    return {
      kind,
      label: commercialContextLabels[kind as keyof typeof commercialContextLabels],
      sourceRecords: matching.length,
      variants: new Set(matching.map(({ record }) => record.variantId)).size,
      products: new Set(matching.map(({ record }) => record.variant!.productId)).size,
      topContexts: [...counts.entries()].map(([name, ids]) => ({ name, variants: ids.size })).sort((a, b) => b.variants - a.variants || a.name.localeCompare(b.name)).slice(0, 20),
    };
  }).filter((group) => group.sourceRecords > 0);

  const officialWording = records.filter((record) => record.source.kind === "OFFICIAL" && /(exclusive to|exclusively available|germany only|german exclusive|nur in deutschland|exclusif|exclusivité|exclusivo|esclusiv)/i.test(JSON.stringify(record.rawPayload)));
  const communityCandidates = observations.filter(({ classification }) => classification.kind === "OTHER_DOCUMENTED_CONTEXT" && /exclusive|exclusiv/i.test(classification.canonicalName));

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: {
      sourceRecords: observations.length,
      variants: new Set(observations.map(({ record }) => record.variantId)).size,
      products: new Set(observations.map(({ record }) => record.variant!.productId)).size,
      distinctRawValues: new Set(observations.map(({ classification }) => classification.canonicalName)).size,
    },
    categories: categoryStats,
    geographicExclusivity: {
      confirmedOfficial: officialWording.map((record) => ({ source: record.source.name, sourceUrl: record.sourceUrl, variantId: record.variantId })),
      communityCandidates: communityCandidates.map(({ record, classification }) => ({ reference: record.variant!.references[0]?.displayValue ?? null, rawValue: classification.canonicalName, sourceUrl: record.sourceUrl, markets: record.variant!.markets.map(({ market }) => market.code) })),
      rule: "Une mention communautaire reste candidate. Seule une formulation géographique explicite conservée dans une SourceRecord officielle peut créer ATTESTED_EXCLUSIVE.",
    },
  }, null, 2));
} finally {
  await db.$disconnect();
}
