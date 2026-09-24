import { Prisma } from "../generated/prisma/client";
import { cache } from "react";
import { getDatabaseClient } from "./db";
import { collectorPrioritySql } from "./ranking";

export const PAGE_SIZE = 36;
export const KLICKYPEDIA_PLACEHOLDER =
  "https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.jpg";

export const visibleMediaWhere = {
  sourceUrl: { not: KLICKYPEDIA_PLACEHOLDER },
  OR: [{ canDisplay: true }, { canDisplay: null }],
} satisfies Prisma.MediaAssetWhereInput;

export function catalogueWhere(query: string, themeSlug = ""): Prisma.ProductVariantWhereInput {
  const search = query.trim();
  const filters: Prisma.ProductVariantWhereInput[] = [];
  if (search) filters.push({ OR: [
      { name: { contains: search, mode: "insensitive" } },
      { canonicalKey: { contains: search, mode: "insensitive" } },
      { product: { name: { contains: search, mode: "insensitive" } } },
      { product: { canonicalKey: { contains: search, mode: "insensitive" } } },
      { references: { some: { displayValue: { contains: search, mode: "insensitive" } } } },
      { translations: { some: { name: { contains: search, mode: "insensitive" } } } },
      { themes: { some: { theme: { name: { contains: search, mode: "insensitive" } } } } },
      { product: { themes: { some: { theme: { name: { contains: search, mode: "insensitive" } } } } } },
    ] });
  if (themeSlug) filters.push({
    OR: [
      { themes: { some: { theme: { slug: themeSlug } } } },
      { product: { themes: { some: { theme: { slug: themeSlug } } } } },
    ],
  });
  return filters.length ? { AND: filters } : {};
}

function rankingWhereSql(query: string, themeSlug: string) {
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
      OR EXISTS (SELECT 1 FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id" WHERE vt."variant_id" = pv."id" AND t."name" ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "product_themes" pt JOIN "themes" t ON t."id" = pt."theme_id" WHERE pt."product_id" = p."id" AND t."name" ILIKE ${pattern})
    )`);
  }
  if (themeSlug) clauses.push(Prisma.sql`(
    EXISTS (SELECT 1 FROM "variant_themes" vt JOIN "themes" t ON t."id" = vt."theme_id" WHERE vt."variant_id" = pv."id" AND t."slug" = ${themeSlug})
    OR EXISTS (SELECT 1 FROM "product_themes" pt JOIN "themes" t ON t."id" = pt."theme_id" WHERE pt."product_id" = p."id" AND t."slug" = ${themeSlug})
  )`);
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

export async function getCatalogue(query: string, page: number, themeSlug = "") {
  const db = await getDatabaseClient();
  const where = catalogueWhere(query, themeSlug);
  const ranked = await db.$queryRaw<{ id: string; priority: number }[]>(Prisma.sql`
    SELECT pv."id", (${collectorPrioritySql})::int AS "priority"
    FROM "product_variants" pv
    JOIN "products" p ON p."id" = pv."product_id"
    ${rankingWhereSql(query, themeSlug)}
    ORDER BY "priority" DESC,
      COALESCE(pv."release_year", p."release_year") DESC NULLS LAST,
      pv."canonical_key" ASC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `);
  const ids = ranked.map(({ id }) => id);
  const [total, unordered] = await Promise.all([
    db.productVariant.count({ where }),
    db.productVariant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        canonicalKey: true,
        name: true,
        releaseYear: true,
        pieceCount: true,
        figureCount: true,
        format: true,
        variantKind: true,
        variantLabel: true,
        product: { select: { name: true, baseReference: true, releaseYear: true, kind: true } },
        references: {
          orderBy: [{ isPrimary: "desc" }, { displayValue: "asc" }],
          take: 2,
          select: { displayValue: true, isPrimary: true },
        },
        themes: {
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: { theme: { select: { name: true } } },
        },
        markets: { take: 2, select: { market: { select: { code: true, name: true } } } },
        media: {
          where: visibleMediaWhere,
          orderBy: [{ source: { priority: "asc" } }, { kind: "asc" }, { sourceUrl: "asc" }],
          take: 1,
          select: { sourceUrl: true, kind: true },
        },
      },
    }),
  ]);
  const byId = new Map(unordered.map((variant) => [variant.id, variant]));
  const variants = ids.flatMap((id) => {
    const variant = byId.get(id);
    return variant ? [variant] : [];
  });

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
    GROUP BY t."id", t."slug", t."name"
    ORDER BY "count" DESC, t."name" ASC
    LIMIT ${limit}
  `);
}

export async function getTheme(slug: string) {
  const db = await getDatabaseClient();
  return db.theme.findUnique({ where: { slug }, select: { slug: true, name: true } });
}

const getVariantCached = cache(async (id: string) => {
  const db = await getDatabaseClient();
  return db.productVariant.findUnique({
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
      sourceRecords: {
        include: { source: true },
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });
});

export function getVariant(id: string) {
  return getVariantCached(id);
}
