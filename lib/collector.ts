import type { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";
import { PAGE_SIZE, visibleMediaWhere } from "./catalogue";
import { orderMediaForDisplay } from "./media";
import { COLLECTION_NAME, COLLECTOR_EMAIL, WISHLIST_NAME } from "./collector-constants";
import { summarizeCollectionQuality } from "./collection-management";

export { COLLECTION_NAME, COLLECTOR_EMAIL, WISHLIST_NAME } from "./collector-constants";

export async function getCollectorContext(create = false) {
  const db = await getDatabaseClient();
  let user = await db.user.findUnique({
    where: { email: COLLECTOR_EMAIL },
    include: { collections: { where: { name: COLLECTION_NAME }, take: 1 }, wishlists: { where: { name: WISHLIST_NAME }, take: 1 } },
  });
  if (!user && create) {
    user = await db.user.create({
      data: {
        email: COLLECTOR_EMAIL,
        displayName: "Collectionneur principal",
        collections: { create: { name: COLLECTION_NAME } },
        wishlists: { create: { name: WISHLIST_NAME } },
      },
      include: { collections: true, wishlists: true },
    });
  }
  if (user && create && (!user.collections[0] || !user.wishlists[0])) {
    if (!user.collections[0]) await db.collection.create({ data: { userId: user.id, name: COLLECTION_NAME } });
    if (!user.wishlists[0]) await db.wishlist.create({ data: { userId: user.id, name: WISHLIST_NAME } });
    user = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { collections: { where: { name: COLLECTION_NAME }, take: 1 }, wishlists: { where: { name: WISHLIST_NAME }, take: 1 } },
    });
  }
  return { db, user, collection: user?.collections[0] ?? null, wishlist: user?.wishlists[0] ?? null };
}

export async function getCollectorStatuses(variantIds: string[]) {
  const statuses = new Map<string, { inCollection: boolean; inWishlist: boolean; quantity: number }>();
  for (const id of variantIds) statuses.set(id, { inCollection: false, inWishlist: false, quantity: 0 });
  if (!variantIds.length) return statuses;
  const { db, collection, wishlist } = await getCollectorContext();
  const [owned, wanted] = await Promise.all([
    collection ? db.collectionItem.findMany({ where: { collectionId: collection.id, variantId: { in: variantIds } }, select: { variantId: true, quantity: true } }) : [],
    wishlist ? db.wishlistItem.findMany({ where: { wishlistId: wishlist.id, variantId: { in: variantIds } }, select: { variantId: true } }) : [],
  ]);
  for (const item of owned) statuses.set(item.variantId, { inCollection: true, inWishlist: false, quantity: item.quantity });
  for (const item of wanted) {
    const current = statuses.get(item.variantId);
    statuses.set(item.variantId, { inCollection: current?.inCollection ?? false, inWishlist: true, quantity: current?.quantity ?? 0 });
  }
  return statuses;
}

export async function getCollectorSummary() {
  const { db, collection, wishlist } = await getCollectorContext();
  const [catalogue, collectionCount, wishlistCount] = await Promise.all([
    db.productVariant.count(),
    collection ? db.collectionItem.aggregate({ where: { collectionId: collection.id }, _sum: { quantity: true }, _count: true }) : null,
    wishlist ? db.wishlistItem.count({ where: { wishlistId: wishlist.id } }) : 0,
  ]);
  return { catalogue, collection: collectionCount?._sum.quantity ?? 0, distinctCollection: collectionCount?._count ?? 0, wishlist: wishlistCount };
}

export async function getVariantCollectorState(variantId: string) {
  const { db, collection, wishlist } = await getCollectorContext();
  const [item, wanted] = await Promise.all([
    collection ? db.collectionItem.findUnique({ where: { collectionId_variantId: { collectionId: collection.id, variantId } } }) : null,
    wishlist ? db.wishlistItem.findUnique({ where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId } } }) : null,
  ]);
  return { item, wanted };
}

const itemVariantInclude = {
  product: { select: { name: true, baseReference: true, releaseYear: true, kind: true, rangeMemberships: { take: 2, select: { range: { select: { slug: true, canonicalName: true } } } } } },
  references: { orderBy: [{ isPrimary: "desc" as const }, { displayValue: "asc" as const }], take: 2, select: { displayValue: true } },
  markets: { orderBy: { market: { name: "asc" as const } }, select: { market: { select: { code: true, name: true } } } },
  themes: { orderBy: { isPrimary: "desc" as const }, take: 1, select: { theme: { select: { name: true, slug: true } } } },
  media: { where: visibleMediaWhere, orderBy: [{ source: { priority: "asc" as const } }, { kind: "asc" as const }, { sourceUrl: "asc" as const }], take: 8, select: { sourceUrl: true, kind: true } },
} satisfies Prisma.ProductVariantInclude;

function collectionSearchWhere(query: string, theme: string, range = "", year?: number): Prisma.ProductVariantWhereInput {
  const filters: Prisma.ProductVariantWhereInput[] = [];
  if (query) filters.push({ OR: [
    { name: { contains: query, mode: "insensitive" } },
    { canonicalKey: { contains: query, mode: "insensitive" } },
    { product: { name: { contains: query, mode: "insensitive" } } },
    { product: { canonicalKey: { contains: query, mode: "insensitive" } } },
    { references: { some: { displayValue: { contains: query, mode: "insensitive" } } } },
    { translations: { some: { name: { contains: query, mode: "insensitive" } } } },
    { product: { translations: { some: { name: { contains: query, mode: "insensitive" } } } } },
  ] });
  if (theme) filters.push({ OR: [
    { themes: { some: { theme: { slug: theme } } } },
    { product: { themes: { some: { theme: { slug: theme } } } } },
  ] });
  if (range) filters.push({ product: { rangeMemberships: { some: { range: { slug: range } } } } });
  if (year) filters.push({ OR: [{ releaseYear: year }, { product: { releaseYear: year } }] });
  return filters.length ? { AND: filters } : {};
}

export type CollectionFilters = {
  query?: string | undefined;
  theme?: string | undefined;
  range?: string | undefined;
  year?: number | undefined;
  condition?: string | undefined;
  complete?: "yes" | "no" | "unknown" | undefined;
  box?: "yes" | "no" | "unknown" | undefined;
  instructions?: "yes" | "no" | "unknown" | undefined;
  purchaseDate?: "known" | "unknown" | undefined;
  purchasePrice?: "known" | "unknown" | undefined;
  multiple?: boolean | undefined;
  review?: "all" | "condition" | "complete" | "box" | "instructions" | "purchaseDate" | "purchasePrice" | "quantity" | undefined;
};

function nullableBooleanFilter(value: CollectionFilters["complete"]): boolean | null | undefined {
  return value === "yes" ? true : value === "no" ? false : value === "unknown" ? null : undefined;
}

export function buildCollectionItemWhere(collectionId: string, filters: CollectionFilters): Prisma.CollectionItemWhereInput {
  const where: Prisma.CollectionItemWhereInput = {
    collectionId,
    variant: collectionSearchWhere(filters.query ?? "", filters.theme ?? "", filters.range ?? "", filters.year),
  };
  const allowedConditions = ["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"] as const;
  const condition = allowedConditions.find((value) => value === filters.condition);
  if (condition) where.condition = condition;
  const complete = nullableBooleanFilter(filters.complete);
  const box = nullableBooleanFilter(filters.box);
  const instructions = nullableBooleanFilter(filters.instructions);
  if (complete !== undefined) where.isComplete = complete;
  if (box !== undefined) where.hasBox = box;
  if (instructions !== undefined) where.hasInstructions = instructions;
  if (filters.purchaseDate) where.purchaseDate = filters.purchaseDate === "known" ? { not: null } : null;
  if (filters.purchasePrice) where.purchasePrice = filters.purchasePrice === "known" ? { not: null } : null;
  if (filters.multiple) where.quantity = { gt: 1 };
  if (filters.review) {
    const reviewWhere: Record<NonNullable<CollectionFilters["review"]>, Prisma.CollectionItemWhereInput> = {
      all: { OR: [{ condition: "UNKNOWN" }, { isComplete: null }, { hasBox: null }, { hasInstructions: null }, { purchaseDate: null }, { purchasePrice: null }, { quantity: { lte: 0 } }, { quantity: { gt: 20 } }] },
      condition: { condition: "UNKNOWN" },
      complete: { isComplete: null },
      box: { hasBox: null },
      instructions: { hasInstructions: null },
      purchaseDate: { purchaseDate: null },
      purchasePrice: { purchasePrice: null },
      quantity: { OR: [{ quantity: { lte: 0 } }, { quantity: { gt: 20 } }] },
    };
    Object.assign(where, { AND: [reviewWhere[filters.review]] });
  }
  return where;
}

export async function getCollectionItems(filters: CollectionFilters, sort: string, page: number) {
  const { db, collection } = await getCollectorContext();
  if (!collection) return { items: [], total: 0, pages: 1 };
  const orderBy: Prisma.CollectionItemOrderByWithRelationInput[] = sort === "quantity"
    ? [{ quantity: "desc" }, { variant: { canonicalKey: "asc" } }]
    : sort === "oldest"
      ? [{ variant: { releaseYear: { sort: "asc", nulls: "last" } } }]
      : [{ variant: { releaseYear: { sort: "desc", nulls: "last" } } }, { variant: { canonicalKey: "asc" } }];
  const where = buildCollectionItemWhere(collection.id, filters);
  const [total, items] = await Promise.all([
    db.collectionItem.count({ where }),
    db.collectionItem.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { variant: { include: itemVariantInclude } } }),
  ]);
  return { items: items.map((item) => ({ ...item, variant: { ...item.variant, media: orderMediaForDisplay(item.variant.media) } })), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getCollectionQualitySummary() {
  const { db, collection } = await getCollectorContext();
  const empty = { total: 0, copies: 0, needsReview: 0, condition: { known: 0, unknown: 0 }, complete: { yes: 0, no: 0, unknown: 0 }, box: { yes: 0, no: 0, unknown: 0 }, instructions: { yes: 0, no: 0, unknown: 0 }, purchaseDate: { known: 0, unknown: 0 }, purchasePrice: { known: 0, unknown: 0 }, notes: { known: 0, unknown: 0 }, suspiciousQuantity: 0 };
  if (!collection) return empty;
  const rows = await db.collectionItem.findMany({ where: { collectionId: collection.id }, select: { quantity: true, condition: true, isComplete: true, hasBox: true, hasInstructions: true, purchaseDate: true, purchasePrice: true, notes: true } });
  return summarizeCollectionQuality(rows);
}

export async function getCollectionRangeOptions() {
  const { db } = await getCollectorContext();
  return db.productRange.findMany({ orderBy: { canonicalName: "asc" }, select: { slug: true, canonicalName: true } });
}

export async function searchCollectionCandidates(query: string, limit = 24) {
  const normalized = query.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return { exact: false, variants: [] };
  const { db } = await getCollectorContext();
  const exactReferences = await db.productReference.findMany({
    where: { OR: [{ normalizedValue: normalized }, { baseValue: normalized }, { displayValue: { equals: query.trim(), mode: "insensitive" } }] },
    orderBy: [{ isPrimary: "desc" }, { displayValue: "asc" }],
    select: { variantId: true },
    take: limit,
  });
  let variantIds = [...new Set(exactReferences.map(({ variantId }) => variantId))];
  const exact = variantIds.length > 0;
  if (!exact) {
    const variants = await db.productVariant.findMany({
      where: collectionSearchWhere(query.trim(), ""),
      orderBy: [{ releaseYear: { sort: "desc", nulls: "last" } }, { canonicalKey: "asc" }],
      select: { id: true },
      take: limit,
    });
    variantIds = variants.map(({ id }) => id);
  }
  if (!variantIds.length) return { exact, variants: [] };
  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds } }, include: itemVariantInclude });
  const order = new Map(variantIds.map((id, index) => [id, index]));
  return { exact, variants: variants.map((variant) => ({ ...variant, media: orderMediaForDisplay(variant.media) })).sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)) };
}

export async function getWishlistItems(query: string, page: number) {
  const { db, wishlist } = await getCollectorContext();
  if (!wishlist) return { items: [], total: 0, pages: 1 };
  const where = { wishlistId: wishlist.id, variant: collectionSearchWhere(query, "") } satisfies Prisma.WishlistItemWhereInput;
  const [total, items] = await Promise.all([
    db.wishlistItem.count({ where }),
    db.wishlistItem.findMany({ where, orderBy: [{ priority: "desc" }, { variant: { releaseYear: { sort: "desc", nulls: "last" } } }, { variant: { canonicalKey: "desc" } }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { variant: { include: itemVariantInclude } } }),
  ]);
  return { items: items.map((item) => ({ ...item, variant: { ...item.variant, media: orderMediaForDisplay(item.variant.media) } })), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
