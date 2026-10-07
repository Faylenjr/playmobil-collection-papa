import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";

type Observation = {
  variantId?: string;
  reference?: string;
  market?: "fr-FR" | "de-DE";
  sourceUrl?: string;
  confirmed?: boolean;
  isArchived?: boolean;
  officialPrice?: { amount: number; currency: string };
};

const markets = {
  "fr-FR": { code: "FRANCE", sourceKey: "playmobil-official-fr", sourceName: "PLAYMOBIL France officiel", baseUrl: "https://www.playmobil.com/fr-fr" },
  "de-DE": { code: "GERMANY", sourceKey: "playmobil-official-de", sourceName: "PLAYMOBIL Allemagne officiel", baseUrl: "https://www.playmobil.com/de-de" },
} as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", "playmobil-official-priority-prices.json"), "utf8")) as { observedAt: string; observations: Observation[] };
  const observedAt = new Date(snapshot.observedAt);
  if (!Number.isFinite(observedAt.getTime())) throw new Error("Date d'observation du snapshot invalide");
  const db = getNodeDatabaseClient();
  try {
    const accepted = snapshot.observations.filter((row): row is Observation & Required<Pick<Observation, "variantId" | "reference" | "market" | "sourceUrl" | "officialPrice">> =>
      Boolean(row.confirmed && row.variantId && row.reference && row.market && row.sourceUrl && row.officialPrice && row.market in markets));
    const local = await db.productVariant.findMany({
      where: { id: { in: [...new Set(accepted.map(({ variantId }) => variantId))] } },
      select: { id: true, references: { where: { isPrimary: true }, take: 1, select: { baseValue: true, identityClass: true } } },
    });
    const validById = new Map(local.flatMap((variant) => variant.references[0]?.identityClass === "ASSIGNED" ? [[variant.id, variant.references[0].baseValue]] as const : []));
    const safe = accepted.filter((row) => validById.get(row.variantId) === row.reference);
    const rejectedIdentity = accepted.length - safe.length;
    const plan = {
      mode: apply ? "APPLY" : "DRY_RUN",
      observedAt: snapshot.observedAt,
      accepted: safe.length,
      references: new Set(safe.map(({ reference }) => reference)).size,
      byMarket: Object.fromEntries(Object.keys(markets).map((market) => [market, safe.filter((row) => row.market === market).length])),
      archived: safe.filter(({ isArchived }) => isArchived).length,
      rejectedIdentity,
    };
    if (!apply) { console.log(JSON.stringify(plan, null, 2)); return; }
    let created = 0;
    let unchanged = 0;
    await db.$transaction(async (tx) => {
      for (const market of Object.keys(markets) as Array<keyof typeof markets>) {
        const config = markets[market];
        const [source, marketRow] = await Promise.all([
          tx.source.upsert({
            where: { key: config.sourceKey },
            update: { name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: observedAt },
            create: { key: config.sourceKey, name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: observedAt },
          }),
          tx.market.findUniqueOrThrow({ where: { code: config.code } }),
        ]);
        for (const row of safe.filter((item) => item.market === market)) {
          const amount = new Prisma.Decimal(row.officialPrice.amount.toFixed(2));
          const existing = await tx.listPriceObservation.findFirst({ where: { variantId: row.variantId, marketId: marketRow.id, sourceId: source.id, sourceUrl: row.sourceUrl, amount, currency: row.officialPrice.currency, observedAt } });
          if (existing) { unchanged += 1; continue; }
          await tx.listPriceObservation.create({ data: {
            variantId: row.variantId, marketId: marketRow.id, sourceId: source.id, sourceUrl: row.sourceUrl,
            amount, currency: row.officialPrice.currency, observedAt,
            ...(row.isArchived ? { validUntil: observedAt } : {}),
          } });
          created += 1;
        }
      }
    });
    console.log(JSON.stringify({ ...plan, created, unchanged }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
