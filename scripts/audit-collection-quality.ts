import "dotenv/config";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";
import { COLLECTION_NAME, WISHLIST_NAME } from "../lib/collector-constants";
import { logicalDuplicateGroups, summarizeCollectionQuality } from "../lib/collection-management";

async function main() {
  const db = getNodeDatabaseClient();
  try {
    const collection = await db.collection.findFirst({ where: { name: COLLECTION_NAME }, include: { items: { include: { variant: { select: { productId: true } } } } } });
    const wishlist = await db.wishlist.findFirst({ where: { name: WISHLIST_NAME }, select: { _count: { select: { items: true } } } });
    const rows = collection?.items ?? [];
    const missingFrench2026 = await db.$queryRaw<Array<{ reference: string }>>(Prisma.sql`
      WITH commercial AS (
        SELECT COALESCE(pr."base_value",pr."normalized_value") reference,p."id" product_id
        FROM "product_variants" pv JOIN "products" p ON p."id"=pv."product_id"
        JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
        WHERE COALESCE(pv."release_year",p."release_year")=2026 AND pr."identity_class"::text IN ('ASSIGNED','REUSED')
          AND (COALESCE(pr."base_value",pr."normalized_value") ~ '^[0-9]{3,4}$' OR COALESCE(pr."base_value",pr."normalized_value") ~ '^7[0-2][0-9]{3}$')
          AND p."kind"::text NOT IN ('PART','MERCHANDISE','CATALOGUE','PROMOTIONAL_ITEM')
          AND COALESCE(pv."format",'') NOT IN ('Magazin','Keychains','Decoration toy')
      )
      SELECT DISTINCT c.reference FROM commercial c
      WHERE NOT EXISTS (SELECT 1 FROM "translations" t WHERE t."product_id"=c.product_id AND LOWER(t.locale) LIKE 'fr%' AND t.name IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM "variant_translations" vt JOIN "product_variants" tv ON tv."id"=vt."variant_id" WHERE tv."product_id"=c.product_id AND LOWER(vt.locale) LIKE 'fr%' AND vt.name IS NOT NULL)
      ORDER BY c.reference
    `);
    const [ranges, figureSeries] = await Promise.all([
      db.productRange.findMany({ select: { canonicalName: true, source: { select: { name: true } }, _count: { select: { memberships: true } } }, orderBy: { canonicalName: "asc" } }),
      db.$queryRaw<Array<{ reference: string | null; name: string | null; variants: number; themed: number }>>(Prisma.sql`
        SELECT p."base_reference" reference,p.name,COUNT(DISTINCT pv.id)::int variants,
               COUNT(DISTINCT vt."variant_id") FILTER (WHERE t.slug='figures-series')::int themed
        FROM products p JOIN product_variants pv ON pv."product_id"=p.id
        LEFT JOIN variant_themes vt ON vt."variant_id"=pv.id LEFT JOIN themes t ON t.id=vt."theme_id"
        WHERE EXISTS (SELECT 1 FROM variant_themes x JOIN themes tx ON tx.id=x."theme_id" JOIN product_variants vx ON vx.id=x."variant_id" WHERE vx."product_id"=p.id AND tx.slug='figures-series')
        GROUP BY p.id ORDER BY variants DESC,p."base_reference"
      `),
    ]);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      collection: { ...summarizeCollectionQuality(rows), entries: rows.length, logicalProducts: new Set(rows.map((row) => row.variant.productId)).size, wishlist: wishlist?._count.items ?? 0, quantityMultiples: rows.filter(({ quantity }) => quantity > 1).length, logicalDuplicateGroups: logicalDuplicateGroups(rows.map((row) => ({ variantId: row.variantId, productId: row.variant.productId }))).length },
      missingFrench2026: missingFrench2026.map(({ reference }) => reference),
      ranges: { count: ranges.length, memberships: ranges.reduce((sum, range) => sum + range._count.memberships, 0), items: ranges },
      figureSeries: { products: figureSeries.length, items: figureSeries },
    }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
