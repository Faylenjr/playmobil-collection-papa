import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "../lib/db";
import { collectorClassFromFactsSql, collectorFactsCtesSql, collectorFactsJoinsSql } from "../lib/ranking";

async function main() {
  const db = await getDatabaseClient();

  const summary = await db.$queryRaw<Array<Record<string, number>>>(Prisma.sql`
    WITH base_usage AS (
      SELECT pr."base_value", COUNT(DISTINCT pr."variant_id")::int AS "variantsUsingBase"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      GROUP BY pr."base_value"
    )
    SELECT
      (SELECT COUNT(*)::int FROM "product_variants") AS "totalVariants",
      COUNT(DISTINCT pr."variant_id") FILTER (WHERE pr."identity_class"::text = 'ASSIGNED')::int AS "assignedVariants",
      COUNT(DISTINCT pr."variant_id") FILTER (
        WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      )::int AS "numericCandidateVariants",
      COUNT(DISTINCT pr."base_value") FILTER (
        WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      )::int AS "numericCandidateBases",
      COUNT(DISTINCT pr."variant_id") FILTER (WHERE bu."variantsUsingBase" = 1)::int AS "variantsWithAnyUniqueBase",
      COUNT(DISTINCT pr."base_value") FILTER (WHERE bu."variantsUsingBase" = 1)::int AS "uniqueSafeBases",
      COUNT(DISTINCT pr."base_value") FILTER (WHERE bu."variantsUsingBase" > 1)::int AS "reusedOrMultipleBases"
    FROM "product_references" pr
    LEFT JOIN base_usage bu ON bu."base_value" = pr."base_value"
  `);

  const byClass = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    candidate_references AS (
      SELECT DISTINCT ON (pr."variant_id") pr."variant_id", pr."base_value"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      ORDER BY pr."variant_id", pr."is_primary" DESC, pr."normalized_value" ASC
    ),
    base_usage AS (
      SELECT pr."base_value", COUNT(DISTINCT pr."variant_id")::int AS "variantsUsingBase"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      GROUP BY pr."base_value"
    ),
    classified AS (
      SELECT pv."id", (${collectorClassFromFactsSql}) AS "collectorClass",
             pr."base_value" AS "baseValue", bu."variantsUsingBase"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${collectorFactsJoinsSql}
      LEFT JOIN candidate_references pr ON pr."variant_id" = pv."id"
      LEFT JOIN base_usage bu ON bu."base_value" = pr."base_value"
    )
    SELECT "collectorClass", COUNT(*)::int AS "total",
           COUNT(*) FILTER (WHERE "baseValue" ~ '^[0-9]{3,8}$')::int AS "numericCandidates",
           COUNT(*) FILTER (WHERE "baseValue" ~ '^[0-9]{3,8}$' AND "variantsUsingBase" = 1)::int AS "uniqueSafeCandidates"
    FROM classified
    GROUP BY "collectorClass"
    ORDER BY "collectorClass"
  `);

  const pilotManifest = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    candidate_references AS (
      SELECT DISTINCT ON (pr."variant_id") pr."variant_id", pr."display_value", pr."base_value"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      ORDER BY pr."variant_id", pr."is_primary" DESC, pr."normalized_value" ASC
    ),
    base_usage AS (
      SELECT pr."base_value", COUNT(DISTINCT pr."variant_id")::int AS "variantsUsingBase"
      FROM "product_references" pr
      WHERE pr."identity_class"::text = 'ASSIGNED' AND pr."base_value" ~ '^[0-9]{3,8}$'
      GROUP BY pr."base_value"
    ),
    eligible AS (
      SELECT DISTINCT pv."id" AS "variantId", pr."display_value" AS "reference", pr."base_value" AS "setNumber",
             COALESCE(pv."name", p."name") AS "name", COALESCE(pv."release_year", p."release_year") AS "releaseYear",
             (${collectorClassFromFactsSql}) AS "collectorClass",
             COALESCE((SELECT MIN(t."name") FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id" WHERE vt."variant_id" = pv."id"),
                      (SELECT MIN(t."name") FROM "product_themes" pt JOIN "themes" t ON t."id" = pt."theme_id" WHERE pt."product_id" = p."id")) AS "theme",
             pv."piece_count" AS "pieceCount", pv."figure_count" AS "figureCount",
             CASE WHEN COALESCE(pv."release_year", p."release_year") < 1990 THEN 'before-1990'
                  WHEN COALESCE(pv."release_year", p."release_year") < 2000 THEN '1990s'
                  WHEN COALESCE(pv."release_year", p."release_year") < 2010 THEN '2000s'
                  WHEN COALESCE(pv."release_year", p."release_year") < 2020 THEN '2010s'
                  ELSE '2020s' END AS era
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${collectorFactsJoinsSql}
      JOIN candidate_references pr ON pr."variant_id" = pv."id"
      JOIN base_usage bu ON bu."base_value" = pr."base_value" AND bu."variantsUsingBase" = 1
      WHERE pr."base_value" ~ '^[0-9]{3,8}$'
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "collectorClass", era ORDER BY md5("variantId"::text)) AS n
      FROM eligible
      WHERE "collectorClass" IN ('SMALL_SET', 'UNKNOWN', 'BUILDING_SET', 'VEHICLE_SET')
    )
    SELECT "variantId", "reference", "setNumber", "name", "theme", "releaseYear", "collectorClass", "pieceCount", "figureCount"
    FROM ranked WHERE n <= 4
    ORDER BY "collectorClass", era, "setNumber"
  `);

  console.log(JSON.stringify({ summary: summary[0], byClass, pilotManifest }, null, 2));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
