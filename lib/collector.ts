import type { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";
import { PAGE_SIZE, visibleMediaWhere } from "./catalogue";
import { orderMediaForDisplay } from "./media";
import { COLLECTION_NAME, COLLECTOR_EMAIL, WISHLIST_NAME } from "./collector-constants";
import { summarizeCollectionQuality } from "./collection-management";
import type { InventoryScope } from "./collection-inventory";

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
    collection ? db.collectionItem.findMany({ where: { collectionId: collection.id, variantId: { in: variantIds } }, select: { variantId: true, _count: { select: { copies: true } } } }) : [],
    wishlist ? db.wishlistItem.findMany({ where: { wishlistId: wishlist.id, variantId: { in: variantIds } }, select: { variantId: true } }) : [],
  ]);
  for (const item of owned) statuses.set(item.variantId, { inCollection: true, inWishlist: false, quantity: item._count.copies });
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
    collection ? Promise.all([
      db.collectionItem.count({ where: { collectionId: collection.id } }),
      db.collectionCopy.count({ where: { collectionItem: { collectionId: collection.id } } }),
    ]) : null,
    wishlist ? db.wishlistItem.count({ where: { wishlistId: wishlist.id } }) : 0,
  ]);
  return { catalogue, collection: collectionCount?.[1] ?? 0, distinctCollection: collectionCount?.[0] ?? 0, wishlist: wishlistCount };
}

export async function getVariantCollectorState(variantId: string) {
  const { db, collection, wishlist } = await getCollectorContext();
  const [item, wanted] = await Promise.all([
    collection ? db.collectionItem.findUnique({ where: { collectionId_variantId: { collectionId: collection.id, variantId } }, include: { copies: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } }) : null,
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
  review?: "all" | "condition" | "complete" | "box" | "instructions" | "purchaseDate" | "purchasePrice" | undefined;
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
  const copyFilters: Prisma.CollectionCopyWhereInput[] = [];
  if (condition) copyFilters.push({ condition });
  const complete = nullableBooleanFilter(filters.complete);
  const box = nullableBooleanFilter(filters.box);
  const instructions = nullableBooleanFilter(filters.instructions);
  if (complete !== undefined) copyFilters.push({ isComplete: complete });
  if (box !== undefined) copyFilters.push({ hasBox: box });
  if (instructions !== undefined) copyFilters.push({ hasInstructions: instructions });
  if (filters.purchaseDate) copyFilters.push({ purchaseDate: filters.purchaseDate === "known" ? { not: null } : null });
  if (filters.purchasePrice) copyFilters.push({ purchasePrice: filters.purchasePrice === "known" ? { not: null } : null });
  if (filters.multiple) where.copies = { some: {} };
  if (filters.review) {
    const reviewWhere: Record<NonNullable<CollectionFilters["review"]>, Prisma.CollectionCopyWhereInput> = {
      all: { OR: [{ condition: "UNKNOWN" }, { isComplete: null }, { hasBox: null }, { hasInstructions: null }, { purchaseDate: null }, { purchasePrice: null }] },
      condition: { condition: "UNKNOWN" },
      complete: { isComplete: null },
      box: { hasBox: null },
      instructions: { hasInstructions: null },
      purchaseDate: { purchaseDate: null },
      purchasePrice: { purchasePrice: null },
    };
    copyFilters.push(reviewWhere[filters.review]);
  }
  if (copyFilters.length) where.copies = { some: { AND: copyFilters } };
  return where;
}

export async function getCollectionItems(filters: CollectionFilters, sort: string, page: number) {
  const { db, collection } = await getCollectorContext();
  if (!collection) return { items: [], total: 0, pages: 1 };
  const orderBy: Prisma.CollectionItemOrderByWithRelationInput[] = sort === "quantity"
    ? [{ copies: { _count: "desc" } }, { variant: { canonicalKey: "asc" } }]
    : sort === "name"
      ? [{ variant: { name: { sort: "asc", nulls: "last" } } }, { variant: { canonicalKey: "asc" } }]
      : sort === "reference"
        ? [{ variant: { canonicalKey: "asc" } }]
    : sort === "oldest"
      ? [{ variant: { releaseYear: { sort: "asc", nulls: "last" } } }]
      : [{ variant: { releaseYear: { sort: "desc", nulls: "last" } } }, { variant: { canonicalKey: "asc" } }];
  let where = buildCollectionItemWhere(collection.id, filters);
  if (filters.multiple) {
    const multiples = await db.collectionCopy.groupBy({ by: ["collectionItemId"], where: { collectionItem: { collectionId: collection.id } }, _count: true, having: { collectionItemId: { _count: { gt: 1 } } } });
    where = { ...where, id: { in: multiples.map(({ collectionItemId }) => collectionItemId) } };
  }
  if (sort === "added") {
    const ordered = await db.collectionItem.findMany({
      where,
      select: { id: true, copies: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { createdAt: true } } },
    });
    ordered.sort((left, right) => (right.copies[0]?.createdAt.getTime() ?? 0) - (left.copies[0]?.createdAt.getTime() ?? 0) || left.id.localeCompare(right.id));
    const total = ordered.length;
    const ids = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(({ id }) => id);
    const rows = await db.collectionItem.findMany({ where: { id: { in: ids } }, include: { copies: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, variant: { include: itemVariantInclude } } });
    const position = new Map(ids.map((id, index) => [id, index]));
    rows.sort((left, right) => (position.get(left.id) ?? 999) - (position.get(right.id) ?? 999));
    return { items: rows.map((item) => ({ ...item, quantity: item.copies.length, variant: { ...item.variant, media: orderMediaForDisplay(item.variant.media) } })), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }
  const [total, items] = await Promise.all([db.collectionItem.count({ where }), db.collectionItem.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { copies: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, variant: { include: itemVariantInclude } } })]);
  return { items: items.map((item) => ({ ...item, quantity: item.copies.length, variant: { ...item.variant, media: orderMediaForDisplay(item.variant.media) } })), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getCollectionQualitySummary() {
  const { db, collection } = await getCollectorContext();
  const empty = { total: 0, copies: 0, needsReview: 0, condition: { known: 0, unknown: 0 }, complete: { yes: 0, no: 0, unknown: 0 }, box: { yes: 0, no: 0, unknown: 0 }, instructions: { yes: 0, no: 0, unknown: 0 }, purchaseDate: { known: 0, unknown: 0 }, purchasePrice: { known: 0, unknown: 0 }, notes: { known: 0, unknown: 0 }, suspiciousQuantity: 0 };
  if (!collection) return empty;
  const rows = await db.collectionCopy.findMany({ where: { collectionItem: { collectionId: collection.id } }, select: { condition: true, isComplete: true, hasBox: true, hasInstructions: true, purchaseDate: true, purchasePrice: true, notes: true } });
  return summarizeCollectionQuality(rows);
}

export async function getCollectionRangeOptions() {
  const { db } = await getCollectorContext();
  return db.productRange.findMany({ orderBy: { canonicalName: "asc" }, select: { slug: true, canonicalName: true } });
}

export async function getInventoryOptions() {
  const { db, collection } = await getCollectorContext();
  if (!collection) return { total: 0, physicalMissing: 0, themes: [], ranges: [], years: [] };
  const items = await db.collectionCopy.findMany({
    where: { collectionItem: { collectionId: collection.id } },
    select: {
      condition: true, isComplete: true, hasBox: true, hasInstructions: true,
      collectionItem: { select: { variant: {
        select: {
          releaseYear: true,
          product: { select: { releaseYear: true, rangeMemberships: { select: { range: { select: { slug: true, canonicalName: true } } } }, themes: { select: { theme: { select: { slug: true, name: true } } } } } },
          themes: { select: { theme: { select: { slug: true, name: true } } } },
        },
      } } },
    },
  });
  const missing = (item: typeof items[number]) => item.condition === "UNKNOWN" || item.isComplete === null || item.hasBox === null || item.hasInstructions === null;
  const themeMap = new Map<string, { slug: string; name: string; total: number; missing: number }>();
  const rangeMap = new Map<string, { slug: string; name: string; total: number; missing: number }>();
  const yearMap = new Map<number, { year: number; total: number; missing: number }>();
  for (const item of items) {
    const variant = item.collectionItem.variant;
    const themes = new Map([...variant.product.themes, ...variant.themes].map(({ theme }) => [theme.slug, theme]));
    for (const theme of themes.values()) {
      const current = themeMap.get(theme.slug) ?? { slug: theme.slug, name: theme.name, total: 0, missing: 0 };
      current.total += 1; current.missing += Number(missing(item)); themeMap.set(theme.slug, current);
    }
    for (const { range } of variant.product.rangeMemberships) {
      const current = rangeMap.get(range.slug) ?? { slug: range.slug, name: range.canonicalName, total: 0, missing: 0 };
      current.total += 1; current.missing += Number(missing(item)); rangeMap.set(range.slug, current);
    }
    const year = variant.releaseYear ?? variant.product.releaseYear;
    if (year) {
      const current = yearMap.get(year) ?? { year, total: 0, missing: 0 };
      current.total += 1; current.missing += Number(missing(item)); yearMap.set(year, current);
    }
  }
  return {
    total: items.length,
    physicalMissing: items.filter(missing).length,
    themes: [...themeMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr")),
    ranges: [...rangeMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr")),
    years: [...yearMap.values()].sort((a, b) => b.year - a.year),
  };
}

export async function getInventoryItems(scope: InventoryScope, value = "") {
  const { db, collection } = await getCollectorContext();
  if (!collection) return [];
  const where: Prisma.CollectionCopyWhereInput = { collectionItem: { collectionId: collection.id } };
  if (scope === "missing") where.OR = [{ condition: "UNKNOWN" }, { isComplete: null }, { hasBox: null }, { hasInstructions: null }];
  if (scope === "condition") where.condition = "UNKNOWN";
  if (scope === "complete") where.isComplete = null;
  if (scope === "box") where.hasBox = null;
  if (scope === "instructions") where.hasInstructions = null;
  if (scope === "theme" && value) where.collectionItem = { collectionId: collection.id, variant: collectionSearchWhere("", value) };
  if (scope === "range" && value) where.collectionItem = { collectionId: collection.id, variant: collectionSearchWhere("", "", value) };
  if (scope === "year" && Number.isInteger(Number(value))) where.collectionItem = { collectionId: collection.id, variant: collectionSearchWhere("", "", "", Number(value)) };
  const rows = await db.collectionCopy.findMany({
    where,
    orderBy: [{ collectionItem: { variant: { releaseYear: { sort: "desc", nulls: "last" } } } }, { collectionItem: { variant: { canonicalKey: "asc" } } }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      collectionItem: {
        include: {
          copies: { select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          variant: {
            include: {
              ...itemVariantInclude,
              product: { select: { ...itemVariantInclude.product.select, _count: { select: { variants: true } } } },
            },
          },
        },
      },
    },
  });
  return rows.map((copy) => ({ ...copy, copyIndex: copy.collectionItem.copies.findIndex(({ id }) => id === copy.id), copyTotal: copy.collectionItem.copies.length, variant: { ...copy.collectionItem.variant, media: orderMediaForDisplay(copy.collectionItem.variant.media) } }));
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
