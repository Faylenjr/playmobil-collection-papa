import type { Prisma, PrismaClient } from "../generated/prisma-node/client";
import { classifyCollectorReference } from "./collector-reference";
import { COLLECTION_NAME, COLLECTOR_EMAIL, WISHLIST_NAME } from "./collector-constants";
import { commerceRefreshSchedule, prioritizeCommerceTargets, type CommerceTargetReason } from "./commerce-targeting";

const targetSelect = {
  id: true,
  productId: true,
  references: { where: { isPrimary: true }, take: 1, select: { baseValue: true, normalizedValue: true, displayValue: true } },
  identifiers: { where: { type: { in: ["EAN", "GTIN"] } }, select: { normalizedValue: true } },
  product: { select: {
    kind: true,
    identifiers: { where: { type: { in: ["EAN", "GTIN"] } }, select: { normalizedValue: true } },
  } },
} satisfies Prisma.ProductVariantSelect;

export type CommerceVariantTarget = Prisma.ProductVariantGetPayload<{ select: typeof targetSelect }>;

function commercialOnly(variants: readonly CommerceVariantTarget[]) {
  return variants.filter((candidate) => {
    const reference = candidate.references[0];
    if (!reference) return false;
    return classifyCollectorReference({
      ...reference,
      identityClass: "ASSIGNED",
      suffix: null,
      productKind: candidate.product.kind,
      format: null,
    }) === "COMMERCIAL";
  });
}

function rotate<T>(rows: readonly T[], size: number, now: Date) {
  if (rows.length <= size) return [...rows];
  const offset = (Math.floor(now.getTime() / 86_400_000) * size) % rows.length;
  return [...rows.slice(offset, offset + size), ...rows.slice(0, Math.max(0, offset + size - rows.length))];
}

export async function selectCommerceTargets(
  db: PrismaClient,
  options: { now?: Date; scheduled?: boolean; limit?: number; recentLimit?: number; collectionBatchSize?: number } = {},
) {
  const now = options.now ?? new Date();
  const schedule = commerceRefreshSchedule(now, options.scheduled ?? false);
  const principalWishlist = { wishlist: { name: WISHLIST_NAME, user: { email: COLLECTOR_EMAIL } } };
  const principalCollection = { collection: { name: COLLECTION_NAME, user: { email: COLLECTOR_EMAIL } } };
  const currentYear = now.getUTCFullYear();

  const [priorityRows, standardRows, recentRows, collectionRows] = await Promise.all([
    db.wishlistItem.findMany({
      where: { ...principalWishlist, priority: 3 },
      orderBy: [{ priority: "desc" }, { variant: { canonicalKey: "asc" } }],
      select: { variant: { select: targetSelect } },
    }),
    schedule.standardWishlist ? db.wishlistItem.findMany({
      where: { ...principalWishlist, priority: { lt: 3 } },
      orderBy: [{ priority: "desc" }, { variant: { canonicalKey: "asc" } }],
      select: { variant: { select: targetSelect } },
    }) : Promise.resolve([]),
    schedule.recent ? db.productVariant.findMany({
      where: { OR: [{ releaseYear: { gte: currentYear } }, { releaseYear: null, product: { releaseYear: { gte: currentYear } } }] },
      orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { releaseYear: { sort: "desc", nulls: "last" } }, { canonicalKey: "desc" }],
      take: Math.max(1, options.recentLimit ?? 50) * 5,
      select: targetSelect,
    }) : Promise.resolve([]),
    schedule.collection ? db.collectionItem.findMany({
      where: principalCollection,
      orderBy: [{ variant: { canonicalKey: "asc" } }],
      select: { variant: { select: targetSelect } },
    }) : Promise.resolve([]),
  ]);

  const priority = commercialOnly(priorityRows.map(({ variant }) => variant));
  const standard = commercialOnly(standardRows.map(({ variant }) => variant));
  const recent = commercialOnly(recentRows).slice(0, options.recentLimit ?? 50);
  const collectionPool = commercialOnly(collectionRows.map(({ variant }) => variant));
  const collection = rotate(collectionPool, options.collectionBatchSize ?? 100, now);
  const groups: Record<CommerceTargetReason, readonly CommerceVariantTarget[]> = {
    WISHLIST_PRIORITY: priority,
    WISHLIST_STANDARD: standard,
    RECENT_RELEASE: recent,
    COLLECTION_ROTATION: collection,
  };
  const selected = prioritizeCommerceTargets(groups, schedule, Math.max(1, options.limit ?? 250));
  const selectedByReason = Object.fromEntries(Object.keys(groups).map((reason) => [reason, selected.filter((row) => row.reason === reason).length])) as Record<CommerceTargetReason, number>;
  return {
    selected,
    schedule,
    candidates: {
      WISHLIST_PRIORITY: priority.length,
      WISHLIST_STANDARD: standard.length,
      RECENT_RELEASE: recent.length,
      COLLECTION_ROTATION: collectionPool.length,
    },
    selectedByReason,
  };
}
