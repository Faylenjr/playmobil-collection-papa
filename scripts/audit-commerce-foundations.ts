import "dotenv/config";
import { getNodeDatabaseClient } from "../lib/db-node";
import { selectCommerceTargets } from "../lib/commerce-targets-node";

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

    const [counts, identifiers, pricesByMarket, priceCoverage2026, candidateStatuses, provenanceColumn, offersBySource, offerCoverage, promotionCoverage, targetPlan, segmentCoverage, identifierCoverage] = await Promise.all([
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
      db.$queryRaw<Array<{ source: string; offers: bigint; variants: bigint; observations: bigint }>>`
        SELECT COALESCE(s.key, 'unknown') AS source,
               count(DISTINCT o.id)::bigint AS offers,
               count(DISTINCT o.variant_id)::bigint AS variants,
               count(po.id)::bigint AS observations
        FROM offers o
        JOIN retailers r ON r.id = o.retailer_id
        LEFT JOIN sources s ON s.id = r.source_id
        LEFT JOIN price_observations po ON po.offer_id = o.id
        GROUP BY COALESCE(s.key, 'unknown') ORDER BY source`,
      db.$queryRaw<Array<{ source: string; variants: bigint; new_variants: bigint; used_variants: bigint }>>`
        SELECT COALESCE(s.key, 'unknown') AS source,
               count(DISTINCT o.variant_id)::bigint AS variants,
               count(DISTINCT o.variant_id) FILTER (WHERE o.condition IN ('NEW', 'SEALED'))::bigint AS new_variants,
               count(DISTINCT o.variant_id) FILTER (WHERE o.condition = 'USED')::bigint AS used_variants
        FROM offers o
        JOIN retailers r ON r.id = o.retailer_id
        LEFT JOIN sources s ON s.id = r.source_id
        WHERE o.availability = 'AVAILABLE'
        GROUP BY COALESCE(s.key, 'unknown') ORDER BY source`,
      db.$queryRaw<Array<{ variants: bigint }>>`
        WITH latest_offer_price AS (
          SELECT DISTINCT ON (po.offer_id) po.offer_id, po.item_price, po.currency, po.observed_at
          FROM price_observations po ORDER BY po.offer_id, po.observed_at DESC
        ), latest_list_price AS (
          SELECT DISTINCT ON (lp.variant_id, lp.market_id, lp.currency)
                 lp.variant_id, lp.market_id, lp.currency, lp.amount
          FROM list_price_observations lp
          ORDER BY lp.variant_id, lp.market_id, lp.currency, lp.observed_at DESC
        )
        SELECT count(DISTINCT o.variant_id)::bigint AS variants
        FROM offers o
        JOIN retailers r ON r.id = o.retailer_id
        JOIN latest_offer_price po ON po.offer_id = o.id
        JOIN latest_list_price lp ON lp.variant_id = o.variant_id AND lp.market_id = r.market_id AND lp.currency = po.currency
        WHERE o.availability = 'AVAILABLE' AND o.condition IN ('NEW', 'SEALED')
          AND o.last_observed_at >= now() - interval '24 hours'
          AND po.item_price < lp.amount`,
      selectCommerceTargets(db, { scheduled: false, limit: 500 }),
      db.$queryRaw<Array<{ segment: string; total: bigint; official_fr: bigint; active_offer: bigint; with_new: bigint; with_used: bigint; comparable: bigint }>>`
        WITH principal_wishlist AS (
          SELECT DISTINCT wi.variant_id FROM wishlist_items wi JOIN wishlists w ON w.id=wi.wishlist_id JOIN users u ON u.id=w.user_id
          WHERE u.email='collectionneur@playmobil.local' AND w.name='Mes recherches'
        ), principal_collection AS (
          SELECT DISTINCT ci.variant_id FROM collection_items ci JOIN collections c ON c.id=ci.collection_id JOIN users u ON u.id=c.user_id
          WHERE u.email='collectionneur@playmobil.local' AND c.name='Ma collection'
        ), recent AS (
          SELECT pv.id AS variant_id FROM product_variants pv JOIN products p ON p.id=pv.product_id
          WHERE COALESCE(pv.release_year,p.release_year)>=2026 ORDER BY pv.release_date DESC NULLS LAST, pv.canonical_key DESC LIMIT 50
        ), segments AS (
          SELECT 'Wishlist' segment, variant_id FROM principal_wishlist UNION ALL SELECT 'Nouveautes', variant_id FROM recent
          UNION ALL SELECT 'Collection', variant_id FROM principal_collection
          UNION ALL SELECT '2026', pv.id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE COALESCE(pv.release_year,p.release_year)=2026
        ), latest_offer AS (
          SELECT DISTINCT ON (o.id) o.id offer_id,o.variant_id,o.product_id,o.condition,o.availability,o.last_observed_at,r.market_id,po.item_price,po.currency
          FROM offers o JOIN retailers r ON r.id=o.retailer_id JOIN price_observations po ON po.offer_id=o.id
          ORDER BY o.id,po.observed_at DESC
        ), latest_list AS (
          SELECT DISTINCT ON (lp.variant_id,lp.market_id,lp.currency) lp.variant_id,lp.market_id,lp.currency,lp.amount,lp.valid_until
          FROM list_price_observations lp ORDER BY lp.variant_id,lp.market_id,lp.currency,lp.observed_at DESC
        )
        SELECT s.segment,count(DISTINCT s.variant_id)::bigint total,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (SELECT 1 FROM latest_list lp JOIN markets m ON m.id=lp.market_id WHERE lp.variant_id=s.variant_id AND m.code='FRANCE'))::bigint official_fr,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (SELECT 1 FROM latest_offer o WHERE o.variant_id=s.variant_id AND o.availability='AVAILABLE' AND o.last_observed_at>=now()-interval '24 hours'))::bigint active_offer,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (SELECT 1 FROM latest_offer o WHERE o.variant_id=s.variant_id AND o.condition IN ('NEW','SEALED') AND o.availability='AVAILABLE' AND o.last_observed_at>=now()-interval '24 hours'))::bigint with_new,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (SELECT 1 FROM latest_offer o WHERE o.variant_id=s.variant_id AND o.condition='USED' AND o.availability='AVAILABLE' AND o.last_observed_at>=now()-interval '24 hours'))::bigint with_used,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (SELECT 1 FROM latest_offer o JOIN latest_list lp ON lp.variant_id=o.variant_id AND lp.market_id=o.market_id AND lp.currency=o.currency AND lp.valid_until IS NULL WHERE o.variant_id=s.variant_id AND o.condition IN ('NEW','SEALED') AND o.availability='AVAILABLE' AND o.last_observed_at>=now()-interval '24 hours' AND o.item_price<lp.amount))::bigint comparable
        FROM segments s GROUP BY s.segment ORDER BY s.segment`,
      db.$queryRaw<Array<{ observations: bigint; unique_values: bigint; references: bigint; wishlist: bigint; release_2026: bigint; collisions: bigint }>>`
        SELECT count(*)::bigint observations,count(DISTINCT pi.normalized_value)::bigint unique_values,
          count(DISTINCT COALESCE(pi.variant_id::text,pi.product_id::text))::bigint references,
          count(DISTINCT pi.normalized_value) FILTER (WHERE EXISTS (SELECT 1 FROM wishlist_items wi WHERE wi.variant_id=pi.variant_id))::bigint wishlist,
          count(DISTINCT pi.normalized_value) FILTER (WHERE EXISTS (SELECT 1 FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE (pv.id=pi.variant_id OR p.id=pi.product_id) AND COALESCE(pv.release_year,p.release_year)=2026))::bigint release_2026,
          (SELECT count(*) FROM (SELECT normalized_value FROM product_identifiers WHERE type IN ('EAN','GTIN','UPC') GROUP BY normalized_value HAVING count(DISTINCT COALESCE(variant_id::text,product_id::text))>1) c)::bigint collisions
        FROM product_identifiers pi WHERE pi.type IN ('EAN','GTIN','UPC')`,
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
      tracking: {
        candidates: targetPlan.candidates,
        selectedWithinSafetyLimit: targetPlan.selected.length,
        selectedByReason: targetPlan.selectedByReason,
        cycleLimit: 250,
        rationale: "priorité wishlist, puis nouveautés, puis rotation collection; catalogue historique exclu des cycles automatiques",
      },
      offersBySource: offersBySource.map((row) => ({ source: row.source, offers: Number(row.offers), variants: Number(row.variants), observations: Number(row.observations) })),
      activeOfferCoverage: offerCoverage.map((row) => ({ source: row.source, variants: Number(row.variants), withNew: Number(row.new_variants), withUsed: Number(row.used_variants) })),
      promotionComparableVariants: Number(promotionCoverage[0]?.variants ?? 0),
      segmentCoverage: segmentCoverage.map((row) => ({ segment: row.segment, total: Number(row.total), withOfficialPriceFr: Number(row.official_fr), withActiveOffer: Number(row.active_offer), withNew: Number(row.with_new), withUsed: Number(row.with_used), withComparablePromotion: Number(row.comparable) })),
      eanCoverage: identifierCoverage[0] ? { observations: Number(identifierCoverage[0].observations), uniqueValues: Number(identifierCoverage[0].unique_values), targets: Number(identifierCoverage[0].references), wishlist: Number(identifierCoverage[0].wishlist), release2026: Number(identifierCoverage[0].release_2026), collisions: Number(identifierCoverage[0].collisions) } : null,
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
