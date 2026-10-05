import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";
import { classifyCollectorReference } from "../lib/collector-reference";
import { classifyRecentEntry, summarizeStatuses, type LocalReference, type SnapshotEntry } from "../lib/recent-catalogue-audit";

type Snapshot = { sourceRole: string; sourceUrl: string; observedAt: string; entries: SnapshotEntry[] };
type OfficialSnapshot = { observedAt: string; observations: Array<{ reference: string; market: string; confirmed: boolean; officialPrice?: { amount: number; currency: string } | null }> };

async function readSnapshot(year: number) {
  return JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", `koupobol-${year}.json`), "utf8")) as Snapshot;
}

async function main() {
  const db = getNodeDatabaseClient();
  try {
    const local = await db.$queryRaw<LocalReference[]>(Prisma.sql`
      SELECT p."id"::text AS "productId", pv."id"::text AS "variantId", pv."release_year" AS "releaseYear",
        p."kind"::text AS "productKind", pv."format", pr."display_value" AS "displayValue",
        pr."normalized_value" AS "normalizedValue", pr."base_value" AS "baseValue", pr."suffix",
        pr."identity_class"::text AS "identityClass"
      FROM "product_variants" pv
      JOIN "products" p ON p."id"=pv."product_id"
      JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
      ORDER BY pr."base_value", pr."normalized_value", pv."canonical_key"
    `);
    const years = [2025, 2026, 2027].map((year) => {
      const rows = local.filter((row) => row.releaseYear === year);
      const commercial = rows.filter((row) => classifyCollectorReference(row) === "COMMERCIAL");
      return {
        year,
        products: new Set(rows.map((row) => row.productId)).size,
        variants: new Set(rows.map((row) => row.variantId)).size,
        commercialReferences: new Set(commercial.map((row) => row.baseValue ?? row.normalizedValue)).size,
        commercialProducts: new Set(commercial.map((row) => row.productId)).size,
        commercialVariants: new Set(commercial.map((row) => row.variantId)).size,
      };
    });
    const comparisons = [];
    const official = JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", "playmobil-official-recent.json"), "utf8")) as OfficialSnapshot;
    const officiallyConfirmed = new Set(official.observations.filter((row) => row.confirmed).map((row) => row.reference));
    for (const year of [2026, 2027]) {
      const snapshot = await readSnapshot(year);
      const entries = snapshot.entries.map((entry) => ({ ...entry, status: classifyRecentEntry(entry, local) }));
      comparisons.push({
        year, sourceUrl: snapshot.sourceUrl, observedAt: snapshot.observedAt, total: entries.length,
        statuses: summarizeStatuses(entries.map((entry) => entry.status)),
        missingConfirmation: {
          confirmedOfficial: entries.filter((entry) => entry.status === "MISSING_LOCAL" && officiallyConfirmed.has(entry.reference)).length,
          notConfirmedOfficial: entries.filter((entry) => entry.status === "MISSING_LOCAL" && !officiallyConfirmed.has(entry.reference)).length,
        },
        entries,
      });
    }
    const latest = JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", "koupobol-latest.json"), "utf8")) as { sourceUrl: string; observedAt: string; entries: Array<{ reference: string }> };
    const localBases = new Set(local.map((row) => row.baseValue ?? row.normalizedValue));
    const latestSummary = {
      sourceUrl: latest.sourceUrl, observedAt: latest.observedAt, total: latest.entries.length,
      presentLocal: latest.entries.filter((entry) => localBases.has(entry.reference)).length,
      missingLocal: latest.entries.filter((entry) => !localBases.has(entry.reference)).length,
      missingConfirmedOfficial: latest.entries.filter((entry) => !localBases.has(entry.reference) && officiallyConfirmed.has(entry.reference)).length,
    };
    const officialPriceCoverage = Object.fromEntries(["fr-FR", "de-DE", "en-US"].map((market) => [market, official.observations.filter((row) => row.confirmed && row.officialPrice && row.market === market).length]));
    const waveCoverage = await db.$queryRaw<Array<{ releaseYear: number; waveReferences: number; total2026Commercial: number }>>(Prisma.sql`
      SELECT 2026 AS "releaseYear", COUNT(DISTINCT rwi."observed_reference")::int AS "waveReferences",
        (SELECT COUNT(DISTINCT pr."base_value")::int
         FROM "product_variants" pv JOIN "products" p ON p."id"=pv."product_id"
         JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
         WHERE pv."release_year"=2026 AND pr."identity_class"::text IN ('ASSIGNED','REUSED')
           AND (COALESCE(pr."base_value",pr."normalized_value") ~ '^[0-9]{3,4}$' OR COALESCE(pr."base_value",pr."normalized_value") ~ '^7[0-2][0-9]{3}$')
           AND p."kind"::text NOT IN ('PART','MERCHANDISE','CATALOGUE','PROMOTIONAL_ITEM')
           AND COALESCE(pv."format",'') NOT IN ('Magazin','Keychains','Decoration toy')) AS "total2026Commercial"
      FROM "release_wave_items" rwi JOIN "release_waves" rw ON rw."id"=rwi."release_wave_id" WHERE rw."release_year"=2026
    `);
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), years, comparisons, latestSummary, officialPriceCoverage, waveCoverage: waveCoverage[0] }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
