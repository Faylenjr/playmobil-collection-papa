import { Prisma } from "../generated/prisma/client";
import { getVariantsByIds } from "./catalogue";
import { getCollectorContext, getCollectorStatuses } from "./collector";
import { getDatabaseClient } from "./db";

type CollectorState = { inCollection: boolean; inWishlist: boolean; quantity: number } | undefined;

export function summarizeProductStates(products: Array<{ variants: Array<{ id: string }> }>, statuses: Map<string, CollectorState>) {
  let owned = 0;
  let wanted = 0;
  for (const product of products) {
    const states = product.variants.map(({ id }) => statuses.get(id));
    if (states.some((state) => state?.inCollection)) owned += 1;
    else if (states.some((state) => state?.inWishlist)) wanted += 1;
  }
  return { total: products.length, owned, wanted, missing: Math.max(0, products.length - owned - wanted) };
}

export async function getProductRanges() {
  const db = await getDatabaseClient();
  const ranges = await db.productRange.findMany({
    orderBy: [{ startYear: "desc" }, { canonicalName: "asc" }],
    include: {
      market: { select: { name: true } },
      memberships: { orderBy: { observedReference: "asc" }, include: { product: { select: { variants: { orderBy: { canonicalKey: "asc" }, select: { id: true } } } } } },
    },
  });
  const allIds = [...new Set(ranges.flatMap((range) => range.memberships.flatMap(({ product }) => product.variants.map(({ id }) => id))))];
  const representativeIds = ranges.flatMap((range) => range.memberships[0]?.product.variants[0]?.id ? [range.memberships[0].product.variants[0].id] : []);
  const [statuses, representatives] = await Promise.all([getCollectorStatuses(allIds), getVariantsByIds(representativeIds)]);
  const representativeById = new Map(representatives.map((variant) => [variant.id, variant]));
  return ranges.map((range) => {
    const products = range.memberships.map(({ product }) => product);
    const progress = summarizeProductStates(products, statuses);
    const representativeId = range.memberships[0]?.product.variants[0]?.id;
    return { ...range, ...progress, imageUrl: representativeId ? representativeById.get(representativeId)?.media[0]?.sourceUrl ?? null : null };
  });
}

export async function getProductRange(slug: string) {
  const db = await getDatabaseClient();
  const range = await db.productRange.findUnique({
    where: { slug },
    include: {
      market: { select: { name: true } },
      source: { select: { name: true } },
      waves: { orderBy: { periodStart: "asc" }, select: { slug: true, name: true, releaseYear: true } },
      memberships: { orderBy: { observedReference: "asc" }, include: { product: { select: { id: true, variants: { orderBy: { canonicalKey: "asc" }, select: { id: true } } } } } },
    },
  });
  if (!range) return null;
  const allIds = range.memberships.flatMap(({ product }) => product.variants.map(({ id }) => id));
  const representativeIds = range.memberships.flatMap(({ product }) => product.variants[0]?.id ? [product.variants[0].id] : []);
  const [statuses, variants] = await Promise.all([getCollectorStatuses(allIds), getVariantsByIds(representativeIds)]);
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const items = range.memberships.flatMap((membership) => {
    const representativeId = membership.product.variants[0]?.id;
    const variant = representativeId ? variantById.get(representativeId) : null;
    if (!variant) return [];
    const states = membership.product.variants.map(({ id }) => statuses.get(id));
    return [{
      ...membership,
      variant,
      variantCount: membership.product.variants.length,
      inCollection: states.some((state) => state?.inCollection),
      inWishlist: states.some((state) => state?.inWishlist),
    }];
  });
  return { ...range, items, ...summarizeProductStates(range.memberships.map(({ product }) => product), statuses) };
}

export async function getUpcomingCandidates(year = 2027) {
  const db = await getDatabaseClient();
  const rows = await db.externalCandidate.findMany({
    where: { status: { in: ["DISCOVERED", "CORROBORATED", "OFFICIAL_CONFIRMED", "CONFLICTING"] }, observations: { some: { announcedYear: year } } },
    orderBy: { normalizedReference: "asc" },
    include: { observations: { where: { announcedYear: year }, orderBy: [{ source: { priority: "asc" } }, { lastObservedAt: "desc" }], include: { source: { select: { name: true, kind: true } } } } },
  });
  return rows.map((candidate) => {
    const preferred = candidate.observations.find(({ observedName }) => observedName) ?? candidate.observations[0];
    return { ...candidate, name: preferred?.observedName ?? null, announcedMonth: preferred?.announcedMonth ?? null, sources: new Set(candidate.observations.map(({ sourceId }) => sourceId)).size };
  });
}

export async function getRecentCommercialProducts(year: number, limit = 72) {
  const db = await getDatabaseClient();
  const rows = await db.$queryRaw<Array<{ id: string; productId: string; releaseDate: Date | null }>>(Prisma.sql`
    WITH eligible AS (
      SELECT pv."id", pv."product_id" AS "productId", pv."release_date" AS "releaseDate",
             ROW_NUMBER() OVER (PARTITION BY pv."product_id" ORDER BY pv."canonical_key") AS rank
      FROM "product_variants" pv
      JOIN "products" p ON p."id"=pv."product_id"
      JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
      WHERE COALESCE(pv."release_year",p."release_year")=${year}
        AND pr."identity_class"::text IN ('ASSIGNED','REUSED')
        AND (COALESCE(pr."base_value",pr."normalized_value") ~ '^[0-9]{3,4}$' OR COALESCE(pr."base_value",pr."normalized_value") ~ '^7[0-2][0-9]{3}$')
        AND p."kind"::text NOT IN ('PART','MERCHANDISE','CATALOGUE','PROMOTIONAL_ITEM')
        AND COALESCE(pv."format",'') NOT IN ('Magazin','Keychains','Decoration toy')
    )
    SELECT "id", "productId", "releaseDate" FROM eligible WHERE rank=1
    ORDER BY "releaseDate" DESC NULLS LAST, "id" ASC LIMIT ${limit}
  `);
  const [variants, statuses] = await Promise.all([getVariantsByIds(rows.map(({ id }) => id)), getCollectorStatuses(rows.map(({ id }) => id))]);
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  return rows.flatMap((row) => {
    const variant = byId.get(row.id);
    return variant ? [{ variant, releaseDate: row.releaseDate, status: statuses.get(row.id) }] : [];
  });
}

export async function getCollectionInsights() {
  const { db, collection, wishlist } = await getCollectorContext();
  if (!collection) return { totalCopies: 0, distinctVariants: 0, distinctProducts: 0, wishlist: 0, themes: [], years: [], multiples: [] };
  const items = await db.collectionItem.findMany({
    where: { collectionId: collection.id },
    include: { variant: { select: { id: true, productId: true, releaseYear: true, product: { select: { releaseYear: true } }, themes: { select: { theme: { select: { slug: true, name: true } } } } } } },
  });
  const themeMap = new Map<string, { slug: string; name: string; products: Set<string> }>();
  const yearMap = new Map<number, Set<string>>();
  for (const item of items) {
    for (const { theme } of item.variant.themes) {
      const entry = themeMap.get(theme.slug) ?? { slug: theme.slug, name: theme.name, products: new Set<string>() };
      entry.products.add(item.variant.productId); themeMap.set(theme.slug, entry);
    }
    const year = item.variant.releaseYear ?? item.variant.product.releaseYear;
    if (year) { const products = yearMap.get(year) ?? new Set<string>(); products.add(item.variant.productId); yearMap.set(year, products); }
  }
  const multipleIds = items.filter(({ quantity }) => quantity > 1).map(({ variantId }) => variantId);
  const multiples = await getVariantsByIds(multipleIds);
  const quantityById = new Map(items.map(({ variantId, quantity }) => [variantId, quantity]));
  return {
    totalCopies: items.reduce((sum, item) => sum + item.quantity, 0),
    distinctVariants: items.length,
    distinctProducts: new Set(items.map(({ variant }) => variant.productId)).size,
    wishlist: wishlist ? await db.wishlistItem.count({ where: { wishlistId: wishlist.id } }) : 0,
    themes: [...themeMap.values()].map((theme) => ({ slug: theme.slug, name: theme.name, count: theme.products.size })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr")),
    years: [...yearMap].map(([year, products]) => ({ year, count: products.size })).sort((a, b) => b.year - a.year),
    multiples: multiples.map((variant) => ({ variant, quantity: quantityById.get(variant.id) ?? 1 })),
  };
}

export async function getThemeCollectorView(slug: string, status = "all", limit = 48) {
  const db = await getDatabaseClient();
  const theme = await db.theme.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
  if (!theme) return null;
  const commercialProducts = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH themed_products AS (
      SELECT pt."product_id" FROM "product_themes" pt JOIN "themes" t ON t."id"=pt."theme_id" LEFT JOIN "themes" parent ON parent."id"=t."parent_id" WHERE t."slug"=${slug} OR parent."slug"=${slug}
      UNION
      SELECT pv."product_id" FROM "variant_themes" vt JOIN "themes" t ON t."id"=vt."theme_id" LEFT JOIN "themes" parent ON parent."id"=t."parent_id" JOIN "product_variants" pv ON pv."id"=vt."variant_id" WHERE t."slug"=${slug} OR parent."slug"=${slug}
    )
    SELECT DISTINCT p."id" FROM themed_products tp JOIN "products" p ON p."id"=tp."product_id" JOIN "product_variants" pv ON pv."product_id"=p."id" JOIN "product_references" pr ON pr."variant_id"=pv."id" AND pr."is_primary"=true
    WHERE pr."identity_class"::text IN ('ASSIGNED','REUSED')
      AND (COALESCE(pr."base_value",pr."normalized_value") ~ '^[0-9]{3,4}$' OR COALESCE(pr."base_value",pr."normalized_value") ~ '^7[0-2][0-9]{3}$')
      AND p."kind"::text NOT IN ('PART','MERCHANDISE','CATALOGUE','PROMOTIONAL_ITEM')
      AND COALESCE(pv."format",'') NOT IN ('Magazin','Keychains','Decoration toy')
  `);
  const products = await db.product.findMany({
    where: { id: { in: commercialProducts.map(({ id }) => id) } },
    orderBy: [{ releaseYear: { sort: "desc", nulls: "last" } }, { canonicalKey: "asc" }],
    select: { id: true, variants: { orderBy: { canonicalKey: "asc" }, select: { id: true } } },
  });
  const allIds = products.flatMap(({ variants }) => variants.map(({ id }) => id));
  const statuses = await getCollectorStatuses(allIds);
  const progress = summarizeProductStates(products, statuses);
  const selected = products.filter((product) => {
    const states = product.variants.map(({ id }) => statuses.get(id));
    const owned = states.some((state) => state?.inCollection);
    const wanted = !owned && states.some((state) => state?.inWishlist);
    return status === "owned" ? owned : status === "wanted" ? wanted : status === "missing" ? !owned && !wanted : true;
  });
  const visibleProducts = selected.slice(0, limit);
  const variants = await getVariantsByIds(visibleProducts.flatMap(({ variants: productVariants }) => productVariants[0]?.id ? [productVariants[0].id] : []));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const items = visibleProducts.flatMap((product) => {
    const representativeId = product.variants[0]?.id;
    const variant = representativeId ? variantById.get(representativeId) : null;
    if (!variant) return [];
    const states = product.variants.map(({ id }) => statuses.get(id));
    return [{ productId: product.id, variant, variantCount: product.variants.length, inCollection: states.some((state) => state?.inCollection), inWishlist: states.some((state) => state?.inWishlist) }];
  });
  return { theme, ...progress, items, filteredTotal: selected.length, truncated: selected.length > limit };
}
