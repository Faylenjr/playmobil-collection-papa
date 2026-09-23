export const KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL =
  "https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.jpg";

export type SourceMediaClassification = "PRODUCT_MEDIA" | "GENERIC_SOURCE_FALLBACK";

/**
 * Classifies only source fallbacks that have been individually verified.
 * Deliberately do not infer this from filenames, domains, extensions or paths.
 */
export function classifySourceMedia(sourceUrl: string): SourceMediaClassification {
  return sourceUrl === KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL
    ? "GENERIC_SOURCE_FALLBACK"
    : "PRODUCT_MEDIA";
}

export function isGenericSourceMedia(sourceUrl: string): boolean {
  return classifySourceMedia(sourceUrl) === "GENERIC_SOURCE_FALLBACK";
}
