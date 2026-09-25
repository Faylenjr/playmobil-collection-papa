import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "../lib/db";
import { collectorClassFromFactsSql, collectorFactsCtesSql, collectorFactsJoinsSql } from "../lib/ranking";
import { parseOfficialPageObservation, type OfficialMarket, type OfficialPageObservation } from "../lib/official-source-audit";
import { PoliteHttpClient } from "../src/importers/http";

type Candidate = {
  variantId: string; reference: string; setNumber: string; name: string | null; theme: string | null;
  releaseYear: number | null; collectorClass: "SMALL_SET" | "UNKNOWN"; variantKind: string;
  figureCount: number | null; mediaCount: number; stratum: string;
};

const marketConfig: Record<OfficialMarket, string> = {
  "fr-FR": "https://www.playmobil.com/fr-fr",
  "de-DE": "https://www.playmobil.com/de-de",
};

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

async function candidates(limit: number): Promise<{ db: Awaited<ReturnType<typeof getDatabaseClient>>; rows: Candidate[] }> {
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<Candidate[]>(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    base_usage AS (
      SELECT pr."base_value", COUNT(DISTINCT pr."variant_id")::int AS "variantsUsingBase"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      GROUP BY pr."base_value"
    ), candidate_references AS (
      SELECT DISTINCT ON (pr."variant_id") pr."variant_id", pr."display_value", pr."base_value"
      FROM "product_references" pr JOIN base_usage bu ON bu."base_value" = pr."base_value" AND bu."variantsUsingBase" = 1
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      ORDER BY pr."variant_id", pr."is_primary" DESC, pr."normalized_value"
    ), eligible AS (
      SELECT pv."id" AS "variantId", pr."display_value" AS reference, pr."base_value" AS "setNumber",
             COALESCE(pv."name", p."name") AS name, COALESCE(pv."release_year", p."release_year") AS "releaseYear",
             (${collectorClassFromFactsSql}) AS "collectorClass", pv."variant_kind"::text AS "variantKind",
             pv."figure_count" AS "figureCount", (SELECT COUNT(*)::int FROM "media_assets" ma WHERE ma."variant_id" = pv."id") AS "mediaCount",
             COALESCE((SELECT MIN(t."name") FROM "variant_themes" vt JOIN "themes" t ON t."id"=vt."theme_id" WHERE vt."variant_id"=pv."id"),
                      (SELECT MIN(t."name") FROM "product_themes" pt JOIN "themes" t ON t."id"=pt."theme_id" WHERE pt."product_id"=p."id")) AS theme,
             CONCAT((${collectorClassFromFactsSql}), '|',
               CASE WHEN COALESCE(pv."release_year", p."release_year") < 1990 THEN 'pre-1990' WHEN COALESCE(pv."release_year", p."release_year") < 2000 THEN '1990s'
                    WHEN COALESCE(pv."release_year", p."release_year") < 2010 THEN '2000s' WHEN COALESCE(pv."release_year", p."release_year") < 2020 THEN '2010s' ELSE '2020s' END, '|',
               CASE WHEN pv."variant_kind"::text='MARKET' THEN 'market' ELSE 'other' END, '|',
               CASE WHEN pv."figure_count" IS NULL THEN 'fig-unknown' ELSE 'fig-known' END, '|',
               CASE WHEN EXISTS(SELECT 1 FROM "media_assets" ma WHERE ma."variant_id"=pv."id") THEN 'media' ELSE 'no-media' END) AS stratum
      FROM "product_variants" pv JOIN "products" p ON p."id"=pv."product_id"
      ${collectorFactsJoinsSql}
      JOIN candidate_references pr ON pr."variant_id"=pv."id"
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY stratum ORDER BY md5("variantId"::text)) AS n
      FROM eligible WHERE "collectorClass" IN ('SMALL_SET','UNKNOWN')
    )
    SELECT "variantId", reference, "setNumber", name, theme, "releaseYear", "collectorClass", "variantKind", "figureCount", "mediaCount", stratum
    FROM ranked WHERE n <= 3 ORDER BY n, stratum, "setNumber" LIMIT ${limit}
  `);
  return { db, rows };
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = Math.min(120, Math.max(80, Number(limitArg?.split("=")[1] ?? 100)));
  const { db, rows } = await candidates(limit);
  const client = new PoliteHttpClient({ minDelayMs: Number(process.env.OFFICIAL_AUDIT_DELAY_MS ?? 1500), maxRetries: 1 });
  const results: Array<Candidate & { observations: OfficialPageObservation[]; failures: Array<{ market: OfficialMarket; status: string }> }> = [];

  for (const candidate of rows) {
    const observations: OfficialPageObservation[] = [];
    const failures: Array<{ market: OfficialMarket; status: string }> = [];
    for (const market of ["fr-FR", "de-DE"] as const) {
      const sourceUrl = `${marketConfig[market]}/${encodeURIComponent(candidate.setNumber)}.html`;
      try {
        const response = await client.get(sourceUrl);
        if (response.status !== 200) { failures.push({ market, status: `HTTP ${response.status}` }); continue; }
        const observation = parseOfficialPageObservation(response.body, sourceUrl, market);
        if (observation.reference.toUpperCase() !== candidate.setNumber.toUpperCase()) {
          failures.push({ market, status: `REFERENCE_MISMATCH:${observation.reference}` }); continue;
        }
        observations.push(observation);
      } catch (error) {
        failures.push({ market, status: error instanceof Error ? error.message : String(error) });
      }
    }
    results.push({ ...candidate, observations, failures });
  }

  const matched = results.filter((row) => row.observations.length > 0);
  const coverage = (market: OfficialMarket | "any", predicate: (observation: OfficialPageObservation) => boolean) => results.filter((row) => {
    const observations = market === "any" ? row.observations : row.observations.filter((item) => item.market === market);
    return observations.some(predicate);
  }).length;
  const contradictions = matched.flatMap((row) => {
    const fr = row.observations.find((item) => item.market === "fr-FR");
    const de = row.observations.find((item) => item.market === "de-DE");
    if (!fr || !de) return [];
    return ["figureCount", "pieceCount", "packageDimensions", "productDimensions", "weightGrams"].filter((field) => {
      const frValue = fr[field as keyof OfficialPageObservation];
      const deValue = de[field as keyof OfficialPageObservation];
      return frValue !== undefined && deValue !== undefined && !same(frValue, deValue);
    }).map((field) => ({ variantId: row.variantId, reference: row.reference, field, fr: fr[field as keyof OfficialPageObservation], de: de[field as keyof OfficialPageObservation] }));
  });
  const fieldPredicates: Record<string, (item: OfficialPageObservation) => boolean> = {
    name: (item) => Boolean(item.name && item.name !== item.reference), pieceCount: (item) => item.pieceCount !== undefined,
    figureCount: (item) => item.figureCount !== undefined, packageDimensions: (item) => item.packageDimensions !== undefined,
    productDimensions: (item) => item.productDimensions !== undefined, weight: (item) => item.weightGrams !== undefined,
    releaseYear: (item) => item.releaseYear !== undefined,
    boxFront: (item) => item.imageKinds.includes("box_front"), boxBack: (item) => item.imageKinds.includes("box_back"),
    mainImage: (item) => item.imageKinds.includes("main"), breadcrumb: (item) => item.breadcrumbs.length > 0,
  };
  const fieldCoverage = Object.fromEntries(Object.entries(fieldPredicates).map(([field, predicate]) => [field, {
    any: coverage("any", predicate), fr: coverage("fr-FR", predicate), de: coverage("de-DE", predicate),
  }]));
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(), sampleSize: rows.length,
    sampleProfile: {
      smallSet: rows.filter((row) => row.collectorClass === "SMALL_SET").length,
      unknown: rows.filter((row) => row.collectorClass === "UNKNOWN").length,
      marketVariants: rows.filter((row) => row.variantKind === "MARKET").length,
      withoutMedia: rows.filter((row) => row.mediaCount === 0).length,
      figureCountKnown: rows.filter((row) => row.figureCount !== null).length,
    },
    officialMatches: { any: matched.length, fr: coverage("fr-FR", () => true), de: coverage("de-DE", () => true), both: matched.filter((row) => row.observations.length === 2).length },
    fieldCoverage, contradictions, results,
  }, null, 2));
  await db.$disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
