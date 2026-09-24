import type { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "./db";
import { PAGE_SIZE, visibleMediaWhere } from "./catalogue";

export const COLLECTOR_EMAIL = "collectionneur@playmobil.local";
export const COLLECTION_NAME = "Ma collection";
export const WISHLIST_NAME = "Mes recherches";

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
  product: { select: { name: true, baseReference: true, releaseYear: true, kind: true } },
  references: { orderBy: [{ isPrimary: "desc" as const }, { displayValue: "asc" as const }], take: 2, select: { displayValue: true } },
  themes: { orderBy: { isPrimary: "desc" as const }, take: 1, select: { theme: { select: { name: true, slug: true } } } },
  media: { where: visibleMediaWhere, orderBy: [{ source: { priority: "asc" as const } }, { kind: "asc" as const }, { sourceUrl: "asc" as const }], take: 1, select: { sourceUrl: true } },
} satisfies Prisma.ProductVariantInclude;

function collectionSearchWhere(query: string, theme: string): Prisma.ProductVariantWhereInput {
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
  return filters.length ? { AND: filters } : {};
}

export async function getCollectionItems(query: string, theme: string, sort: string, page: number) {
  const { db, collection } = await getCollectorContext();
  if (!collection) return { items: [], total: 0, pages: 1 };
  const orderBy: Prisma.CollectionItemOrderByWithRelationInput[] = sort === "quantity"
    ? [{ quantity: "desc" }, { variant: { canonicalKey: "asc" } }]
    : sort === "oldest"
      ? [{ variant: { releaseYear: { sort: "asc", nulls: "last" } } }]
      : [{ variant: { releaseYear: { sort: "desc", nulls: "last" } } }, { variant: { canonicalKey: "asc" } }];
  const where = { collectionId: collection.id, variant: collectionSearchWhere(query, theme) } satisfies Prisma.CollectionItemWhereInput;
  const [total, items] = await Promise.all([
    db.collectionItem.count({ where }),
    db.collectionItem.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { variant: { include: itemVariantInclude } } }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getWishlistItems(query: string, page: number) {
  const { db, wishlist } = await getCollectorContext();
  if (!wishlist) return { items: [], total: 0, pages: 1 };
  const where = { wishlistId: wishlist.id, variant: collectionSearchWhere(query, "") } satisfies Prisma.WishlistItemWhereInput;
  const [total, items] = await Promise.all([
    db.wishlistItem.count({ where }),
    db.wishlistItem.findMany({ where, orderBy: [{ priority: "desc" }, { variant: { releaseYear: { sort: "desc", nulls: "last" } } }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { variant: { include: itemVariantInclude } } }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
