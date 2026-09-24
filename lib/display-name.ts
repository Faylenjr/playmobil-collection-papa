import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";

export type DisplayNameCandidates = {
  officialFrenchName?: string | null | undefined;
  variantName?: string | null | undefined;
  productName?: string | null | undefined;
  fallback?: string | null | undefined;
};

/** A localized name is preferred only when its provenance is explicitly official. */
export function getPreferredDisplayName(candidates: DisplayNameCandidates) {
  return candidates.officialFrenchName?.trim()
    || candidates.variantName?.trim()
    || candidates.productName?.trim()
    || candidates.fallback?.trim()
    || "Nom non renseigné";
}

export async function getOfficialFrenchNames(variantIds: string[]) {
  const names = new Map<string, string>();
  if (!variantIds.length) return names;
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<{ variantId: string; name: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (sv."entity_id")
           sv."entity_id"::text AS "variantId",
           COALESCE(sv."normalized_value", sv."raw_value") #>> '{}' AS "name"
    FROM "source_values" sv
    JOIN "sources" s ON s."id" = sv."source_id"
    WHERE sv."entity_type" = 'ProductVariant'
      AND sv."entity_id" IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND LOWER(sv."field") IN ('name.fr', 'name.fr-fr', 'name.fr_fr')
      AND s."kind"::text = 'OFFICIAL'
      AND COALESCE(sv."normalized_value", sv."raw_value") #>> '{}' <> ''
    ORDER BY sv."entity_id", sv."is_selected" DESC, s."priority" ASC, sv."retrieved_at" DESC
  `);
  for (const row of rows) if (row.name?.trim()) names.set(row.variantId, row.name.trim());
  return names;
}
