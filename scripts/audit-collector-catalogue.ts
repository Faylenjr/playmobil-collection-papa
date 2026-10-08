import "dotenv/config";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";
import { officialMissing2026References } from "../lib/official-product-import";
import { COLLECTION_NAME, WISHLIST_NAME } from "../lib/collector-constants";

type CoverageRow = {
  year: number;
  products: number;
  variants: number;
  commercialReferences: number;
  withImage: number;
  withFrenchName: number;
  withReleaseDate: number;
  withTheme: number;
  withOfficialPrice: number;
};

async function main() {
  const db = getNodeDatabaseClient();
  try {
    const coverage = await db.$queryRaw<CoverageRow[]>(Prisma.sql`
      WITH commercial AS (
        SELECT COALESCE(pv."release_year",p."release_year")::int AS year, p."id" AS product_id, pv."id" AS variant_id,
               COALESCE(pr."base_value",pr."normalized_value") AS reference,
               EXISTS (SELECT 1 FROM "media_assets" ma JOIN "product_variants" mv ON mv."id"=ma."variant_id" WHERE mv."product_id"=p."id" AND ma."can_display" IS DISTINCT FROM FALSE) AS has_image,
               EXISTS (SELECT 1 FROM "translations" t WHERE t."product_id"=p."id" AND LOWER(t."locale") LIKE 'fr%') OR EXISTS (SELECT 1 FROM "variant_translations" vt JOIN "product_variants" tv ON tv."id"=vt."variant_id" WHERE tv."product_id"=p."id" AND LOWER(vt."locale") LIKE 'fr%') AS has_fr,
               EXISTS (SELECT 1 FROM "product_variants" dv WHERE dv."product_id"=p."id" AND dv."release_date" IS NOT NULL) AS has_date,
               EXISTS (SELECT 1 FROM "product_themes" pt WHERE pt."product_id"=p."id") OR EXISTS (SELECT 1 FROM "variant_themes" vth JOIN "product_variants" tv ON tv."id"=vth."variant_id" WHERE tv."product_id"=p."id") AS has_theme,
               EXISTS (SELECT 1 FROM "list_price_observations" lp JOIN "product_variants" lv ON lv."id"=lp."variant_id" WHERE lv."product_id"=p."id") AS has_price
        FROM "product_variants" pv
        JOIN "products" p ON p."id"=pv."product_id"
        JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
        WHERE COALESCE(pv."release_year",p."release_year") IN (2025,2026,2027)
          AND pr."identity_class"::text IN ('ASSIGNED','REUSED')
          AND (COALESCE(pr."base_value",pr."normalized_value") ~ '^[0-9]{3,4}$' OR COALESCE(pr."base_value",pr."normalized_value") ~ '^7[0-2][0-9]{3}$')
          AND p."kind"::text NOT IN ('PART','MERCHANDISE','CATALOGUE','PROMOTIONAL_ITEM')
          AND COALESCE(pv."format",'') NOT IN ('Magazin','Keychains','Decoration toy')
      ), refs AS (
        SELECT year, reference, BOOL_OR(has_image) has_image, BOOL_OR(has_fr) has_fr, BOOL_OR(has_date) has_date, BOOL_OR(has_theme) has_theme, BOOL_OR(has_price) has_price
        FROM commercial GROUP BY year, reference
      )
      SELECT c.year, COUNT(DISTINCT c.product_id)::int products, COUNT(DISTINCT c.variant_id)::int variants, COUNT(DISTINCT c.reference)::int AS "commercialReferences",
             COUNT(DISTINCT r.reference) FILTER (WHERE r.has_image)::int AS "withImage",
             COUNT(DISTINCT r.reference) FILTER (WHERE r.has_fr)::int AS "withFrenchName",
             COUNT(DISTINCT r.reference) FILTER (WHERE r.has_date)::int AS "withReleaseDate",
             COUNT(DISTINCT r.reference) FILTER (WHERE r.has_theme)::int AS "withTheme",
             COUNT(DISTINCT r.reference) FILTER (WHERE r.has_price)::int AS "withOfficialPrice"
      FROM commercial c JOIN refs r ON r.year=c.year AND r.reference=c.reference GROUP BY c.year ORDER BY c.year
    `);
    const [officialImports, candidateGroups, ranges, collector] = await Promise.all([
      db.product.findMany({ where: { baseReference: { in: [...officialMissing2026References] } }, select: { baseReference: true, releaseYear: true, canonicalKey: true } }),
      db.externalCandidate.groupBy({ by: ["status"], where: { observations: { some: { announcedYear: 2027 } } }, _count: true }),
      db.productRange.findMany({ select: { slug: true, canonicalName: true, _count: { select: { memberships: true } } }, orderBy: { canonicalName: "asc" } }),
      db.collection.findFirst({ where: { name: COLLECTION_NAME }, select: { items: { select: { quantity: true, variant: { select: { productId: true } } } }, user: { select: { wishlists: { where: { name: WISHLIST_NAME }, select: { _count: { select: { items: true } } } } } } } }),
    ]);
    const imported = officialImports.filter(({ canonicalKey }) => canonicalKey.startsWith("official:playmobil:"));
    const items = collector?.items ?? [];
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      years: coverage,
      official2026AuditImports: { expected: officialMissing2026References.length, imported: imported.length, withSourcedReleaseYear: imported.filter(({ releaseYear }) => releaseYear !== null).length, references: imported.map(({ baseReference }) => baseReference).sort() },
      candidates2027: Object.fromEntries(candidateGroups.map((row) => [row.status, row._count])),
      ranges: { count: ranges.length, memberships: ranges.reduce((sum, range) => sum + range._count.memberships, 0), items: ranges },
      collection: { copies: items.reduce((sum, item) => sum + item.quantity, 0), variants: items.length, products: new Set(items.map(({ variant }) => variant.productId)).size, multiples: items.filter(({ quantity }) => quantity > 1).length, wishlist: collector?.user.wishlists[0]?._count.items ?? 0 },
    }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
