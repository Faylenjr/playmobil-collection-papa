import { Prisma } from "../generated/prisma/client";
import { cache } from "react";
import { getDatabaseClient } from "./db";
import { getOfficialFrenchNames, getPreferredDisplayName } from "./display-name";
import { collectorPrioritySql } from "./ranking";

export const PAGE_SIZE = 36;
export const KLICKYPEDIA_PLACEHOLDER =
  "https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.jpg";

export const visibleMediaWhere = {
  sourceUrl: { not: KLICKYPEDIA_PLACEHOLDER },
  OR: [{ canDisplay: true }, { canDisplay: null }],
} satisfies Prisma.MediaAssetWhereInput;

export type CatalogueSort = "recommended" | "newest" | "oldest" | "reference";

export function parseCatalogueSort(value: string | undefined): CatalogueSort {
  return value === "newest" || value === "oldest" || value === "reference" ? value : "recommended";
}

function rankingWhereSql(query: string, themeSlug: string, year?: number) {
  const clauses: Prisma.Sql[] = [];
  if (query.trim()) {
    const pattern = `%${query.trim()}%`;
    clauses.push(Prisma.sql`(
      pv."name" ILIKE ${pattern}
      OR pv."canonical_key" ILIKE ${pattern}
      OR p."name" ILIKE ${pattern}
      OR p."canonical_key" ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM "product_references" pr WHERE pr."variant_id" = pv."id" AND pr."display_value" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "variant_translations" tr WHERE tr."variant_id" = pv."id" AND tr."name" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "translations" tr WHERE tr."product_id" = p."id" AND tr."name" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id" WHERE vt."variant_id" = pv."id" AND t."name" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "product_themes" pt JOIN "themes" t ON t."id" = pt."theme_id" WHERE pt."product_id" = p."id" AND t."name" ILIKE ${pattern})
    )`);
  }
  if (themeSlug) clauses.push(Prisma.sql`EXISTS (
    SELECT 1
    FROM (
      SELECT vt."theme_id" FROM "variant_themes" vt WHERE vt."variant_id" = pv."id"
      UNION
      SELECT pt."theme_id" FROM "product_themes" pt WHERE pt."product_id" = p."id"
    ) assigned_theme
    JOIN "themes" t ON t."id" = assigned_theme."theme_id"
    LEFT JOIN "themes" parent ON parent."id" = t."parent_id"
    WHERE t."slug" = ${themeSlug} OR parent."slug" = ${themeSlug}
  )`);
  if (year) clauses.push(Prisma.sql`COALESCE(pv."release_year", p."release_year") = ${year}`);
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

function catalogueOrderSql(sort: CatalogueSort) {
  if (sort === "newest") return Prisma.sql`"effective_date" DESC NULLS LAST, "reference_sort" ASC, "id" ASC`;
  if (sort === "oldest") return Prisma.sql`"effective_date" ASC NULLS LAST, "reference_sort" ASC, "id" ASC`;
  if (sort === "reference") return Prisma.sql`
    ("priority" = 0) ASC,
    NULLIF(SUBSTRING("reference_sort" FROM '^([0-9]+)'), '')::bigint ASC NULLS LAST,
    "reference_sort" ASC,
    "id" ASC
  `;
  return Prisma.sql`"priority" DESC, "effective_date" DESC NULLS LAST, "reference_sort" ASC, "id" ASC`;
}

const catalogueVariantSelect = {
  id: true,
  canonicalKey: true,
  name: true,
  releaseYear: true,
  releaseDate: true,
  pieceCount: true,
  figureCount: true,
  format: true,
  variantKind: true,
  variantLabel: true,
  product: { select: { name: true, baseReference: true, releaseYear: true, kind: true } },
  references: {
    orderBy: [{ isPrimary: "desc" as const }, { displayValue: "asc" as const }],
    take: 2,
    select: { displayValue: true, isPrimary: true },
  },
  themes: {
    orderBy: { isPrimary: "desc" as const },
    take: 1,
    select: { theme: { select: { name: true, slug: true } } },
  },
  markets: { take: 2, select: { market: { select: { code: true, name: true } } } },
  media: {
    where: visibleMediaWhere,
    orderBy: [{ source: { priority: "asc" as const } }, { kind: "asc" as const }, { sourceUrl: "asc" as const }],
    take: 1,
    select: { sourceUrl: true, kind: true },
  },
} satisfies Prisma.ProductVariantSelect;

async function getVariantsInOrder(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDatabaseClient();
  const [unordered, officialNames] = await Promise.all([
    db.productVariant.findMany({ where: { id: { in: ids } }, select: catalogueVariantSelect }),
    getOfficialFrenchNames(ids),
  ]);
  const byId = new Map(unordered.map((variant) => [variant.id, variant]));
  return ids.flatMap((id) => {
    const variant = byId.get(id);
    return variant ? [{ ...variant, displayName: getPreferredDisplayName({ officialFrenchName: officialNames.get(id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey }) }] : [];
  });
}

export async function getCatalogue(
  query: string,
  page: number,
  themeSlug = "",
  sort: CatalogueSort = "recommended",
  year?: number,
) {
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<{ id: string; priority: number; total: number }[]>(Prisma.sql`
    WITH scored AS (
      SELECT pv."id",
             (${collectorPrioritySql})::int AS "priority",
             COALESCE(pv."release_date", MAKE_DATE(COALESCE(pv."release_year", p."release_year"), 1, 1)) AS "effective_date",
             LOWER(COALESCE(
               (SELECT pr."display_value" FROM "product_references" pr WHERE pr."variant_id" = pv."id" ORDER BY pr."is_primary" DESC, pr."display_value" ASC LIMIT 1),
               p."base_reference", pv."canonical_key"
             )) AS "reference_sort"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      ${rankingWhereSql(query, themeSlug, year)}
    ), counted AS (
      SELECT *, (COUNT(*) OVER())::int AS "total"
      FROM scored
    )
    SELECT "id", "priority", "total"
    FROM counted
    ORDER BY ${catalogueOrderSql(sort)}
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const total = rows[0]?.total ?? 0;
  const variants = await getVariantsInOrder(rows.map(({ id }) => id));
  return { total, variants, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getThemes(limit = 30) {
  const db = await getDatabaseClient();
  return db.$queryRaw<{ slug: string; name: string; count: number }[]>(Prisma.sql`
    WITH themed AS (
      SELECT "theme_id", "variant_id" FROM "variant_themes"
      UNION
      SELECT pt."theme_id", pv."id" AS "variant_id"
      FROM "product_themes" pt
      JOIN "product_variants" pv ON pv."product_id" = pt."product_id"
    )
    SELECT t."slug", t."name", COUNT(DISTINCT themed."variant_id")::int AS "count"
    FROM "themes" t
    JOIN themed ON themed."theme_id" = t."id"
    WHERE t."parent_id" IS NULL
    GROUP BY t."id", t."slug", t."name"
    ORDER BY "count" DESC, t."name" ASC
    LIMIT ${limit}
  `);
}

export async function getTheme(slug: string) {
  const db = await getDatabaseClient();
  return db.theme.findUnique({
    where: { slug },
    select: { slug: true, name: true, parent: { select: { slug: true, name: true } } },
  });
}

export async function getThemeNavigation(slug: string) {
  const db = await getDatabaseClient();
  const [children, years] = await Promise.all([
    db.$queryRaw<{ slug: string; name: string; count: number }[]>(Prisma.sql`
      WITH themed AS (
        SELECT "theme_id", "variant_id" FROM "variant_themes"
        UNION
        SELECT pt."theme_id", pv."id" AS "variant_id"
        FROM "product_themes" pt
        JOIN "product_variants" pv ON pv."product_id" = pt."product_id"
      )
      SELECT child."slug", child."name", COUNT(DISTINCT themed."variant_id")::int AS "count"
      FROM "themes" parent
      JOIN "themes" child ON child."parent_id" = parent."id"
      LEFT JOIN themed ON themed."theme_id" = child."id"
      WHERE parent."slug" = ${slug}
      GROUP BY child."id", child."slug", child."name"
      HAVING COUNT(DISTINCT themed."variant_id") > 0
      ORDER BY "count" DESC, child."name" ASC
    `),
    db.$queryRaw<{ year: number; count: number }[]>(Prisma.sql`
      WITH assigned AS (
        SELECT vt."variant_id" FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id" LEFT JOIN "themes" parent ON parent."id" = t."parent_id" WHERE t."slug" = ${slug} OR parent."slug" = ${slug}
        UNION
        SELECT pv."id" FROM "product_themes" pt JOIN "themes" t ON t."id" = pt."theme_id" LEFT JOIN "themes" parent ON parent."id" = t."parent_id" JOIN "product_variants" pv ON pv."product_id" = pt."product_id" WHERE t."slug" = ${slug} OR parent."slug" = ${slug}
      )
      SELECT COALESCE(pv."release_year", p."release_year")::int AS "year", COUNT(DISTINCT pv."id")::int AS "count"
      FROM assigned
      JOIN "product_variants" pv ON pv."id" = assigned."variant_id"
      JOIN "products" p ON p."id" = pv."product_id"
      WHERE COALESCE(pv."release_year", p."release_year") IS NOT NULL
      GROUP BY COALESCE(pv."release_year", p."release_year")
      ORDER BY "year" DESC
    `),
  ]);
  return { children, years };
}

export async function getLatestReleases(yearLimit = 3, perYear = 24) {
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<{ id: string; releaseYear: number; priority: number }[]>(Prisma.sql`
    WITH releases AS (
      SELECT pv."id",
             COALESCE(pv."release_year", p."release_year")::int AS "releaseYear",
             COALESCE(pv."release_date", MAKE_DATE(COALESCE(pv."release_year", p."release_year"), 1, 1)) AS "effective_date",
             (${collectorPrioritySql})::int AS "priority"
      FROM "product_variants" pv
      JOIN "products" p ON p."id" = pv."product_id"
      WHERE COALESCE(pv."release_year", p."release_year") IS NOT NULL
    ), latest_years AS (
      SELECT DISTINCT "releaseYear" FROM releases ORDER BY "releaseYear" DESC LIMIT ${yearLimit}
    ), ranked AS (
      SELECT releases.*, ROW_NUMBER() OVER (
        PARTITION BY "releaseYear"
        ORDER BY "effective_date" DESC NULLS LAST, "priority" DESC, "id" ASC
      ) AS row_number
      FROM releases
      JOIN latest_years USING ("releaseYear")
    )
    SELECT "id", "releaseYear", "priority"
    FROM ranked
    WHERE row_number <= ${perYear}
    ORDER BY "releaseYear" DESC, "effective_date" DESC NULLS LAST, "priority" DESC, "id" ASC
  `);
  const variants = await getVariantsInOrder(rows.map(({ id }) => id));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const groups = new Map<number, typeof variants>();
  for (const variant of variants) {
    const year = rowById.get(variant.id)?.releaseYear;
    if (!year) continue;
    const group = groups.get(year) ?? [];
    group.push(variant);
    groups.set(year, group);
  }
  return [...groups.entries()].map(([year, items]) => ({ year, items }));
}

const getVariantCached = cache(async (id: string) => {
  const db = await getDatabaseClient();
  const variant = await db.productVariant.findUnique({
    where: { id },
    include: {
      product: { include: { translations: true, themes: { include: { theme: true } } } },
      references: { orderBy: [{ isPrimary: "desc" }, { displayValue: "asc" }] },
      translations: { orderBy: { locale: "asc" } },
      themes: { include: { theme: true }, orderBy: { isPrimary: "desc" } },
      markets: { include: { market: true } },
      media: {
        where: visibleMediaWhere,
        include: { source: true },
        orderBy: [{ source: { priority: "asc" } }, { kind: "asc" }, { sourceUrl: "asc" }],
      },
      instructions: { include: { source: true }, orderBy: { locale: "asc" } },
      figures: { include: { figure: true }, take: 100 },
      parts: { include: { part: true }, take: 100 },
      sourceRecords: { include: { source: true }, orderBy: { lastSeenAt: "desc" } },
    },
  });
  if (!variant) return null;
  const officialNames = await getOfficialFrenchNames([id]);
  return { ...variant, displayName: getPreferredDisplayName({ officialFrenchName: officialNames.get(id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey }) };
});

export function getVariant(id: string) {
  return getVariantCached(id);
}
