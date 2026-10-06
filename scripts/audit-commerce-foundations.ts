import "dotenv/config";
import { getNodeDatabaseClient } from "../lib/db-node";

type CountRow = { count: bigint };

async function main() {
  const db = getNodeDatabaseClient();
  try {
    const countQueries = [
      ["Product", db.product.count()],
      ["ProductVariant", db.productVariant.count()],
      ["ProductReference", db.productReference.count()],
      ["CollectionItem", db.collectionItem.count()],
      ["WishlistItem", db.wishlistItem.count()],
      ["ExternalCandidate", db.externalCandidate.count()],
      ["ListPriceObservation", db.listPriceObservation.count()],
      ["Retailer", db.retailer.count()],
      ["Offer", db.offer.count()],
      ["PriceObservation", db.priceObservation.count()],
    ] as const;

    const [counts, identifiers, pricesByMarket, priceCoverage2026, candidateStatuses, provenanceColumn] = await Promise.all([
      Promise.all(countQueries.map(async ([model, query]) => [model, await query] as const)),
      db.$queryRaw<Array<{ type: string; observations: bigint; unique_values: bigint; products: bigint; variants: bigint }>>`
        SELECT type::text,
               count(*)::bigint AS observations,
               count(DISTINCT normalized_value)::bigint AS unique_values,
               count(DISTINCT product_id)::bigint AS products,
               count(DISTINCT variant_id)::bigint AS variants
        FROM product_identifiers
        GROUP BY type
        ORDER BY type`,
      db.$queryRaw<Array<{ market: string; observations: bigint; variants: bigint }>>`
        SELECT m.code AS market, count(*)::bigint AS observations,
               count(DISTINCT lp.variant_id)::bigint AS variants
        FROM list_price_observations lp
        JOIN markets m ON m.id = lp.market_id
        GROUP BY m.code ORDER BY m.code`,
      db.$queryRaw<Array<{ market: string; references_with_price: bigint }>>`
        SELECT m.code AS market,
               count(DISTINCT COALESCE(pr.base_value, pr.normalized_value))::bigint AS references_with_price
        FROM list_price_observations lp
        JOIN markets m ON m.id = lp.market_id
        JOIN product_variants pv ON pv.id = lp.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN product_references pr ON pr.variant_id = pv.id AND pr.is_primary = true
        WHERE COALESCE(pv.release_year, p.release_year) = 2026
          AND pr.identity_class = 'ASSIGNED'
        GROUP BY m.code ORDER BY m.code`,
      db.$queryRaw<Array<{ status: string; count: bigint }>>`
        SELECT status::text, count(*)::bigint AS count
        FROM external_candidates GROUP BY status ORDER BY status`,
      db.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'product_identifiers'
            AND column_name = 'source_record_id'
        ) AS exists`,
    ]);

    let linkedSourceRecords: number | null = null;
    if (provenanceColumn[0]?.exists) {
      const rows = await db.$queryRawUnsafe<CountRow[]>("SELECT count(*)::bigint AS count FROM product_identifiers WHERE source_record_id IS NOT NULL");
      linkedSourceRecords = Number(rows[0]?.count ?? 0);
    }

    console.log(JSON.stringify({
      counts: Object.fromEntries(counts),
      identifiers: identifiers.map((row) => ({ type: row.type, observations: Number(row.observations), uniqueValues: Number(row.unique_values), productTargets: Number(row.products), variantTargets: Number(row.variants) })),
      identifierProvenance: { migrationApplied: provenanceColumn[0]?.exists ?? false, linkedSourceRecords },
      officialPrices: pricesByMarket.map((row) => ({ market: row.market, observations: Number(row.observations), variants: Number(row.variants) })),
      priceCoverage2026: priceCoverage2026.map((row) => ({ market: row.market, referencesWithPrice: Number(row.references_with_price) })),
      candidates: Object.fromEntries(candidateStatuses.map((row) => [row.status, Number(row.count)])),
      adapters: {
        kelkoo: { configured: Boolean(process.env.KELKOO_PUBLISHER_TOKEN?.trim()), country: process.env.KELKOO_COUNTRY?.trim().toLowerCase() || "fr" },
        ebay: { configured: Boolean(process.env.EBAY_CLIENT_ID?.trim() && process.env.EBAY_CLIENT_SECRET?.trim()), marketplace: process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_FR" },
      },
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
