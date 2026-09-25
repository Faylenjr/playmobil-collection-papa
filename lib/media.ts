const MEDIA_KIND_PRIORITY: Record<string, number> = {
  box_front: 0,
  box_back: 1,
  main: 2,
};

/** Order existing assets for display without removing anything from the gallery. */
export function orderMediaForDisplay<T extends { kind: string }>(media: readonly T[]): T[] {
  return media
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const priority = (MEDIA_KIND_PRIORITY[left.asset.kind.toLowerCase()] ?? 3)
        - (MEDIA_KIND_PRIORITY[right.asset.kind.toLowerCase()] ?? 3);
      return priority || left.index - right.index;
    })
    .map(({ asset }) => asset);
}
