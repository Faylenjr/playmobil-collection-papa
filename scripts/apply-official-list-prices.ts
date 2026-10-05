import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";

type OfficialObservation = {
  reference: string;
  market: "fr-FR" | "de-DE" | "en-US";
  sourceUrl: string;
  confirmed: boolean;
  officialPrice: { amount: number; currency: string; availability?: string | null } | null;
};

const supportedMarkets = {
  "fr-FR": { code: "FRANCE", sourceKey: "playmobil-official-fr", sourceName: "PLAYMOBIL France officiel", baseUrl: "https://www.playmobil.com/fr-fr" },
  "de-DE": { code: "GERMANY", sourceKey: "playmobil-official-de", sourceName: "PLAYMOBIL Allemagne officiel", baseUrl: "https://www.playmobil.com/de-de" },
} as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", "playmobil-official-recent.json"), "utf8")) as { observedAt: string; observations: OfficialObservation[] };
  const db = getNodeDatabaseClient();
  try {
    const rows = await db.$queryRaw<Array<{ reference: string; variantId: string; variantsUsingBase: number }>>(Prisma.sql`
      SELECT pr."base_value" AS reference, pv."id"::text AS "variantId",
        COUNT(*) OVER (PARTITION BY pr."base_value")::int AS "variantsUsingBase"
      FROM "product_references" pr JOIN "product_variants" pv ON pv."id"=pr."variant_id"
      WHERE pr."is_primary"=true AND pr."base_value" IS NOT NULL
    `);
    const candidates = snapshot.observations.flatMap((observation) => {
      if (!observation.confirmed || !observation.officialPrice || !(observation.market in supportedMarkets)) return [];
      const local = rows.filter((row) => row.reference === observation.reference);
      if (local.length !== 1 || local[0]!.variantsUsingBase !== 1) return [];
      return [{ observation, variantId: local[0]!.variantId }];
    });
    const skippedMultipleVariants = [...new Set(snapshot.observations
      .filter((observation) => observation.confirmed && observation.officialPrice && observation.market in supportedMarkets)
      .filter((observation) => rows.filter((row) => row.reference === observation.reference).length > 1)
      .map((observation) => observation.reference))];
    const plan = { mode: apply ? "APPLY" : "DRY_RUN", snapshotObservedAt: snapshot.observedAt, wouldCreate: candidates.length, references: new Set(candidates.map((candidate) => candidate.observation.reference)).size, byMarket: Object.fromEntries(Object.keys(supportedMarkets).map((market) => [market, candidates.filter((candidate) => candidate.observation.market === market).length])), skippedMultipleVariants };
    if (!apply) { console.log(JSON.stringify(plan, null, 2)); return; }
    let created = 0;
    await db.$transaction(async (tx) => {
      for (const market of Object.keys(supportedMarkets) as Array<keyof typeof supportedMarkets>) {
        const config = supportedMarkets[market];
        const source = await tx.source.upsert({
          where: { key: config.sourceKey },
          update: { name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: new Date(snapshot.observedAt) },
          create: { key: config.sourceKey, name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: new Date(snapshot.observedAt) },
        });
        const marketRow = await tx.market.findUniqueOrThrow({ where: { code: config.code } });
        for (const { observation, variantId } of candidates.filter((candidate) => candidate.observation.market === market)) {
          const amount = new Prisma.Decimal(observation.officialPrice!.amount.toFixed(2));
          const existing = await tx.listPriceObservation.findFirst({ where: { variantId, marketId: marketRow.id, sourceId: source.id, sourceUrl: observation.sourceUrl, amount, currency: observation.officialPrice!.currency, observedAt: new Date(snapshot.observedAt) } });
          if (!existing) {
            await tx.listPriceObservation.create({ data: { variantId, marketId: marketRow.id, sourceId: source.id, amount, currency: observation.officialPrice!.currency, sourceUrl: observation.sourceUrl, observedAt: new Date(snapshot.observedAt) } });
            created += 1;
          }
        }
      }
    });
    console.log(JSON.stringify({ ...plan, created }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
