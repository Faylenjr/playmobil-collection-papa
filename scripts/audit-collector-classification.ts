import "dotenv/config";
import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "../lib/db";
import {
  collectorClassFromFactsSql,
  collectorFactsCtesSql,
  collectorFactsJoinsSql,
} from "../lib/ranking";

const classOrderSql = Prisma.sql`CASE "collectorClass"
  WHEN 'MAIN_SET' THEN 1 WHEN 'BUILDING_SET' THEN 2 WHEN 'VEHICLE_SET' THEN 3
  WHEN 'SMALL_SET' THEN 4 WHEN 'FIGURE_PACK' THEN 5 WHEN 'SINGLE_FIGURE' THEN 6
  WHEN 'ANIMAL' THEN 7 WHEN 'ACCESSORY' THEN 8 WHEN 'PART' THEN 9
  WHEN 'CATALOGUE' THEN 10 WHEN 'PROMOTIONAL' THEN 11 ELSE 12 END`;

async function main() {
  const db = await getDatabaseClient();
  const distribution = await db.$queryRaw(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    classified AS (
      SELECT pv."id", (${collectorClassFromFactsSql}) AS "collectorClass"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${collectorFactsJoinsSql}
    )
    SELECT "collectorClass", COUNT(*)::int AS "count",
           ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2)::float AS "percent"
    FROM classified
    GROUP BY "collectorClass"
    ORDER BY ${classOrderSql}
  `);

  const themes = ["City Life", "Western", "Pirates", "Knights", "Farm", "Country"];
  const themeSample = await db.$queryRaw(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    themed AS (
      SELECT DISTINCT t."name" AS "theme", pv."id", pv."name", p."name" AS "productName",
             COALESCE(pv."release_year", p."release_year") AS "releaseYear",
             COALESCE(
               (SELECT pr."display_value" FROM "product_references" pr WHERE pr."variant_id" = pv."id"
                ORDER BY pr."is_primary" DESC, pr."display_value" ASC LIMIT 1),
               p."base_reference", pv."canonical_key"
             ) AS "reference",
             (${collectorClassFromFactsSql}) AS "collectorClass"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${collectorFactsJoinsSql}
      JOIN LATERAL (
        SELECT vt."theme_id" FROM "variant_themes" vt WHERE vt."variant_id" = pv."id"
        UNION
        SELECT pt."theme_id" FROM "product_themes" pt WHERE pt."product_id" = p."id"
      ) assigned ON true
      JOIN "themes" t ON t."id" = assigned."theme_id"
      WHERE t."name" IN (${Prisma.join(themes)})
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY "theme"
        ORDER BY ${classOrderSql}, "releaseYear" DESC NULLS LAST, LOWER("reference"), "id"
      ) AS row_number
      FROM themed
    )
    SELECT "theme", "reference", COALESCE("name", "productName") AS "name",
           "releaseYear", "collectorClass"
    FROM ranked
    WHERE row_number <= 20
    ORDER BY "theme", row_number
  `);

  const validationSample = await db.$queryRaw(Prisma.sql`
    WITH ${collectorFactsCtesSql},
    classified AS (
      SELECT pv."id", COALESCE(pv."name", p."name") AS "name", pv."format",
             p."kind"::text AS "productKind", pv."variant_kind"::text AS "variantKind",
             pv."figure_count" AS "figureCount",
             COALESCE(
               (SELECT pr."display_value" FROM "product_references" pr WHERE pr."variant_id" = pv."id"
                ORDER BY pr."is_primary" DESC, pr."display_value" ASC LIMIT 1),
               p."base_reference", pv."canonical_key"
             ) AS "reference",
             (SELECT t."name" FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id"
              WHERE vt."variant_id" = pv."id" ORDER BY vt."is_primary" DESC, t."name" LIMIT 1) AS "theme",
             (${collectorClassFromFactsSql}) AS "collectorClass"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${collectorFactsJoinsSql}
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "collectorClass" ORDER BY md5("id"::text)) AS row_number
      FROM classified
    )
    SELECT "reference", "name", "theme", "productKind", "variantKind", "format",
           "figureCount", "collectorClass"
    FROM ranked
    WHERE row_number <= 5
    ORDER BY ${classOrderSql}, row_number
  `);

  console.log(JSON.stringify({ distribution, validationSample, themeSample }, null, 2));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
