import { createDatabaseClient } from "../src/db/client";
import { classifyMarketRelation, explicitExclusiveClaim, explicitMarketExclusiveClaim } from "../lib/collector-taxonomy";

const db = createDatabaseClient();

function addCount(
  groups: Map<string, { market: string; kind: string; evidenceIds: Set<string>; variantIds: Set<string>; productIds: Set<string> }>,
  market: string,
  kind: string,
  row: { id: string; variantId: string; productId: string },
) {
  const key = `${market}:${kind}`;
  const group = groups.get(key) ?? { market, kind, evidenceIds: new Set<string>(), variantIds: new Set<string>(), productIds: new Set<string>() };
  group.evidenceIds.add(row.id);
  group.variantIds.add(row.variantId);
  group.productIds.add(row.productId);
  groups.set(key, group);
}

try {
  const evidence = await db.marketEvidence.findMany({
    orderBy: [{ market: { code: "asc" } }, { kind: "asc" }, { variantId: "asc" }],
    include: {
      market: { select: { code: true, name: true } },
      source: { select: { key: true, name: true } },
      variant: {
        select: {
          id: true,
          productId: true,
          canonicalKey: true,
          variantKind: true,
          name: true,
          product: { select: { name: true } },
          references: { orderBy: { displayValue: "asc" }, take: 1, select: { displayValue: true } },
          sourceRecords: { orderBy: { lastSeenAt: "desc" }, select: { sourceId: true, sourceUrl: true, rawPayload: true } },
        },
      },
    },
  });

  const before = new Map<string, { market: string; kind: string; evidenceIds: Set<string>; variantIds: Set<string>; productIds: Set<string> }>();
  const after = new Map<string, { market: string; kind: string; evidenceIds: Set<string>; variantIds: Set<string>; productIds: Set<string> }>();
  const rows = evidence.map((item) => {
    const record = item.variant.sourceRecords.find((candidate) => candidate.sourceId === item.sourceId && candidate.sourceUrl === item.sourceUrl)
      ?? item.variant.sourceRecords.find((candidate) => candidate.sourceId === item.sourceId)
      ?? item.variant.sourceRecords[0];
    const proposed = classifyMarketRelation({ variantKind: item.variant.variantKind, rawPayload: record?.rawPayload, marketCode: item.market.code });
    const row = { id: item.id, variantId: item.variantId, productId: item.variant.productId };
    addCount(before, item.market.code, item.kind, row);
    addCount(after, item.market.code, proposed.kind, row);
    return {
      id: item.id,
      market: item.market.code,
      currentKind: item.kind,
      proposedKind: proposed.kind,
      variantId: item.variantId,
      productId: item.variant.productId,
      reference: item.variant.references[0]?.displayValue ?? item.variant.canonicalKey,
      name: item.variant.name ?? item.variant.product.name,
      variantKind: item.variant.variantKind,
      source: item.source?.key ?? null,
      sourceUrl: item.sourceUrl,
      storedEvidence: item.evidence,
      rawCommercialChannel: explicitExclusiveClaim(record?.rawPayload),
      geographicExclusiveClaim: explicitMarketExclusiveClaim(record?.rawPayload, item.market.code),
      proposedEvidence: proposed.evidence,
    };
  });

  const serialize = (groups: typeof before) => [...groups.values()].map((group) => ({
    market: group.market,
    kind: group.kind,
    evidences: group.evidenceIds.size,
    variants: group.variantIds.size,
    products: group.productIds.size,
  })).sort((left, right) => left.market.localeCompare(right.market) || left.kind.localeCompare(right.kind));

  const germanSample = rows
    .filter((row) => row.market === "GERMANY" && row.currentKind === "ATTESTED_EXCLUSIVE")
    .sort((left, right) => left.reference.localeCompare(right.reference, "fr", { numeric: true }) || left.variantId.localeCompare(right.variantId))
    .slice(0, 50);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    totals: {
      evidences: rows.length,
      uniqueVariantMarketPairs: new Set(rows.map((row) => `${row.variantId}:${row.market}`)).size,
      pairsWithMultipleKinds: rows.length - new Set(rows.map((row) => `${row.variantId}:${row.market}`)).size,
      reclassifications: rows.filter((row) => row.currentKind !== row.proposedKind).length,
    },
    before: serialize(before),
    proposedAfter: serialize(after),
    germanAttestedExclusiveSample: germanSample,
  }, null, 2));
} finally {
  await db.$disconnect();
}
