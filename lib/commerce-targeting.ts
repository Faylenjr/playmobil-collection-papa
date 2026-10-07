export type CommerceTargetReason = "WISHLIST_PRIORITY" | "WISHLIST_STANDARD" | "RECENT_RELEASE" | "COLLECTION_ROTATION";

export type CommerceTarget<T> = {
  variant: T;
  reason: CommerceTargetReason;
};

export function commerceRefreshSchedule(now = new Date(), scheduled = true) {
  if (!scheduled) return { standardWishlist: true, recent: true, collection: true };
  const sixHourBucket = Math.floor(now.getTime() / (6 * 3_600_000));
  return {
    standardWishlist: sixHourBucket % 2 === 0,
    recent: sixHourBucket % 2 === 0,
    collection: sixHourBucket % 4 === 0,
  };
}

export function prioritizeCommerceTargets<T extends { id: string }>(
  groups: Record<CommerceTargetReason, readonly T[]>,
  schedule: ReturnType<typeof commerceRefreshSchedule>,
  limit: number,
) {
  const ordered: CommerceTarget<T>[] = [
    ...groups.WISHLIST_PRIORITY.map((variant) => ({ variant, reason: "WISHLIST_PRIORITY" as const })),
    ...(schedule.standardWishlist ? groups.WISHLIST_STANDARD.map((variant) => ({ variant, reason: "WISHLIST_STANDARD" as const })) : []),
    ...(schedule.recent ? groups.RECENT_RELEASE.map((variant) => ({ variant, reason: "RECENT_RELEASE" as const })) : []),
    ...(schedule.collection ? groups.COLLECTION_ROTATION.map((variant) => ({ variant, reason: "COLLECTION_ROTATION" as const })) : []),
  ];
  const seen = new Set<string>();
  return ordered.filter(({ variant }) => {
    if (seen.has(variant.id)) return false;
    seen.add(variant.id);
    return true;
  }).slice(0, limit);
}
