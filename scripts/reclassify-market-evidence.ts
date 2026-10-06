import { createDatabaseClient } from "../src/db/client";
import { classifyMarketRelation } from "../lib/collector-taxonomy";

const db = createDatabaseClient();
const apply = process.argv.includes("--apply");

try {
  const evidence = await db.marketEvidence.findMany({
    include: {
      market: { select: { code: true } },
      variant: {
        select: {
          variantKind: true,
          sourceRecords: { orderBy: { lastSeenAt: "desc" }, select: { sourceId: true, sourceUrl: true, rawPayload: true } },
        },
      },
    },
  });
  const existingKeys = new Map(evidence.map((item) => [`${item.variantId}:${item.marketId}:${item.kind}`, item.id]));
  const changes = evidence.flatMap((item) => {
    const record = item.variant.sourceRecords.find((candidate) => candidate.sourceId === item.sourceId && candidate.sourceUrl === item.sourceUrl)
      ?? item.variant.sourceRecords.find((candidate) => candidate.sourceId === item.sourceId)
      ?? item.variant.sourceRecords[0];
    const relation = classifyMarketRelation({ variantKind: item.variant.variantKind, rawPayload: record?.rawPayload, marketCode: item.market.code });
    const same = item.kind === relation.kind;
    return same ? [] : [{ item, relation }];
  });
  const collisions = changes.flatMap(({ item, relation }) => {
    const existingId = existingKeys.get(`${item.variantId}:${item.marketId}:${relation.kind}`);
    return existingId && existingId !== item.id ? [{ evidenceId: item.id, existingId, variantId: item.variantId, market: item.market.code, targetKind: relation.kind }] : [];
  });
  const transitions = Object.entries(changes.reduce<Record<string, number>>((summary, { item, relation }) => {
    const key = `${item.kind}->${relation.kind}`;
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {})).sort(([left], [right]) => left.localeCompare(right));

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", evidence: evidence.length, changes: changes.length, transitions: Object.fromEntries(transitions), collisions }, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    if (collisions.length) throw new Error(`Reclassification bloquée : ${collisions.length} collision(s)`);
    for (let offset = 0; offset < changes.length; offset += 200) {
      const batch = changes.slice(offset, offset + 200);
      await db.$transaction(batch.map(({ item, relation }) => db.marketEvidence.update({
        where: { id: item.id },
        data: { kind: relation.kind, evidence: relation.evidence, confidence: relation.confidence },
      })));
    }
    console.log(JSON.stringify({ applied: changes.length }, null, 2));
  }
} finally {
  await db.$disconnect();
}
