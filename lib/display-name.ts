import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";

export type DisplayNameCandidates = {
  frenchName?: string | null | undefined;
  variantName?: string | null | undefined;
  productName?: string | null | undefined;
  fallback?: string | null | undefined;
};

/** Prefer an existing French translation, without generating or altering it. */
export function getPreferredDisplayName(candidates: DisplayNameCandidates) {
  return candidates.frenchName?.trim()
    || candidates.variantName?.trim()
    || candidates.productName?.trim()
    || candidates.fallback?.trim()
    || "Nom non renseigné";
}

export async function getFrenchNames(variantIds: string[]) {
  const names = new Map<string, string>();
  if (!variantIds.length) return names;
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<{ variantId: string; name: string }[]>(Prisma.sql`
    WITH candidates AS (
      SELECT pv."id" AS "variantId", vt."name", 0 AS scope_priority,
             CASE WHEN LOWER(REPLACE(vt."locale", '_', '-')) = 'fr' THEN 0 ELSE 1 END AS locale_priority
      FROM "product_variants" pv
      JOIN "variant_translations" vt ON vt."variant_id" = pv."id"
      WHERE pv."id" IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND LOWER(REPLACE(vt."locale", '_', '-')) IN ('fr', 'fr-fr')
        AND NULLIF(BTRIM(vt."name"), '') IS NOT NULL
      UNION ALL
      SELECT pv."id" AS "variantId", tr."name", 1 AS scope_priority,
             CASE WHEN LOWER(REPLACE(tr."locale", '_', '-')) = 'fr' THEN 0 ELSE 1 END AS locale_priority
      FROM "product_variants" pv
      JOIN "translations" tr ON tr."product_id" = pv."product_id"
      WHERE pv."id" IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND LOWER(REPLACE(tr."locale", '_', '-')) IN ('fr', 'fr-fr')
        AND NULLIF(BTRIM(tr."name"), '') IS NOT NULL
    )
    SELECT DISTINCT ON ("variantId") "variantId"::text AS "variantId", "name"
    FROM candidates
    ORDER BY "variantId", scope_priority, locale_priority, "name"
  `);
  for (const row of rows) if (row.name?.trim()) names.set(row.variantId, row.name.trim());
  return names;
}
