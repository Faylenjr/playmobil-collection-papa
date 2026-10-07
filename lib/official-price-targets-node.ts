import type { Prisma, PrismaClient } from "../generated/prisma-node/client";
import { classifyCollectorReference } from "./collector-reference";
import { COLLECTOR_EMAIL, COLLECTION_NAME, WISHLIST_NAME } from "./collector-constants";

export type OfficialPriceTargetReason = "WISHLIST" | "ACTIVE_OFFER" | "RECENT_RELEASE" | "RELEASE_2026" | "RECENT_COLLECTION";

const targetSelect = {
  id: true,
  productId: true,
  canonicalKey: true,
  releaseYear: true,
  format: true,
  references: { where: { isPrimary: true }, take: 1, select: { identityClass: true, baseValue: true, normalizedValue: true, displayValue: true, suffix: true } },
  product: { select: { kind: true, releaseYear: true } },
} satisfies Prisma.ProductVariantSelect;

export type OfficialPriceVariantTarget = Prisma.ProductVariantGetPayload<{ select: typeof targetSelect }>;

function commercialOnly(rows: readonly OfficialPriceVariantTarget[]) {
  return rows.filter((variant) => {
    const reference = variant.references[0];
    if (!reference) return false;
    return classifyCollectorReference({ ...reference, productKind: variant.product.kind, format: variant.format }) === "COMMERCIAL";
  });
}

export async function selectOfficialPriceTargets(db: PrismaClient, options: { limit?: number; recentLimit?: number; collectionLimit?: number } = {}) {
  const principalWishlist = { wishlist: { name: WISHLIST_NAME, user: { email: COLLECTOR_EMAIL } } };
  const principalCollection = { collection: { name: COLLECTION_NAME, user: { email: COLLECTOR_EMAIL } } };
  const [wishlistRows, activeOfferRows, recentRows, release2026Rows, collectionRows] = await Promise.all([
    db.wishlistItem.findMany({ where: principalWishlist, orderBy: [{ priority: "desc" }, { variant: { canonicalKey: "asc" } }], select: { variant: { select: targetSelect } } }),
    db.offer.findMany({ where: { availability: "AVAILABLE", variantId: { not: null } }, orderBy: { lastObservedAt: "desc" }, select: { variant: { select: targetSelect } } }),
    db.productVariant.findMany({ where: { OR: [{ releaseYear: { gte: 2026 } }, { releaseYear: null, product: { releaseYear: { gte: 2026 } } }] }, orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { canonicalKey: "desc" }], take: Math.max(1, options.recentLimit ?? 50) * 5, select: targetSelect }),
    db.productVariant.findMany({ where: { OR: [{ releaseYear: 2026 }, { releaseYear: null, product: { releaseYear: 2026 } }] }, orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { canonicalKey: "desc" }], select: targetSelect }),
    db.collectionItem.findMany({ where: { ...principalCollection, OR: [{ variant: { releaseYear: { gte: 2020 } } }, { variant: { releaseYear: null, product: { releaseYear: { gte: 2020 } } } }] }, orderBy: [{ variant: { canonicalKey: "desc" } }], take: Math.max(1, options.collectionLimit ?? 100) * 5, select: { variant: { select: targetSelect } } }),
  ]);

  const groups: Record<OfficialPriceTargetReason, OfficialPriceVariantTarget[]> = {
    WISHLIST: commercialOnly(wishlistRows.map(({ variant }) => variant)),
    ACTIVE_OFFER: commercialOnly(activeOfferRows.flatMap(({ variant }) => variant ? [variant] : [])),
    RECENT_RELEASE: commercialOnly(recentRows).slice(0, options.recentLimit ?? 50),
    RELEASE_2026: commercialOnly(release2026Rows),
    RECENT_COLLECTION: commercialOnly(collectionRows.map(({ variant }) => variant)).slice(0, options.collectionLimit ?? 100),
  };
  const selected: Array<{ variant: OfficialPriceVariantTarget; reason: OfficialPriceTargetReason }> = [];
  const seen = new Set<string>();
  for (const reason of Object.keys(groups) as OfficialPriceTargetReason[]) {
    for (const variant of groups[reason]) {
      if (seen.has(variant.id)) continue;
      seen.add(variant.id);
      selected.push({ variant, reason });
      if (selected.length >= Math.max(1, options.limit ?? 120)) break;
    }
    if (selected.length >= Math.max(1, options.limit ?? 120)) break;
  }
  const intersections: Record<string, number> = {};
  const reasons = Object.keys(groups) as OfficialPriceTargetReason[];
  for (let left = 0; left < reasons.length; left += 1) {
    for (let right = left + 1; right < reasons.length; right += 1) {
      const leftReason = reasons[left]!; const rightReason = reasons[right]!;
      const rightIds = new Set(groups[rightReason].map(({ id }) => id));
      intersections[`${leftReason}&${rightReason}`] = new Set(groups[leftReason].filter(({ id }) => rightIds.has(id)).map(({ id }) => id)).size;
    }
  }
  return {
    selected,
    candidates: Object.fromEntries(reasons.map((reason) => [reason, new Set(groups[reason].map(({ id }) => id)).size])) as Record<OfficialPriceTargetReason, number>,
    selectedByReason: Object.fromEntries(reasons.map((reason) => [reason, selected.filter((row) => row.reason === reason).length])) as Record<OfficialPriceTargetReason, number>,
    intersections,
  };
}
