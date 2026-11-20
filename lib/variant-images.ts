import reviewedImages from "../data/audit/reviewed-official-images.json";
import { orderMediaForDisplay } from "./media";

export type ImageCandidate = { sourceUrl: string; kind: string };

type StoredImage = ImageCandidate & {
  canDisplay: boolean | null;
  source: { key: string; kind: string };
};

type ReviewedImage = {
  variantId: string;
  reference: string;
  variantKind: string;
  officialReference: string;
  sourcePage: string;
  imageEvidencePage: string;
  sourcePageStatus: string;
  checkedOn: string;
  image: ImageCandidate;
};

type VariantImages = {
  id: string;
  variantKind: string;
  references: readonly { normalizedValue: string; isPrimary: boolean; identityClass: string }[];
  media: readonly StoredImage[];
};

const reviewedByVariant = new Map<string, ReviewedImage>(reviewedImages.map((row) => [row.variantId, row]));
const officialImageHosts = new Set(["media.playmobil.com", "playmobil.a.bigcontent.io"]);
const officialPageHosts = new Set(["www.playmobil.com", "b2b.playmobil.com"]);

function secureUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch {
    return null;
  }
}

export function getImageDisplayPolicy(env: Readonly<Record<string, string | undefined>> = process.env) {
  const disabled = new Set((env.PLAYMOBIL_DISABLED_MEDIA_SOURCES ?? "klickypedia").split(",").map((key) => key.trim().toLowerCase()).filter(Boolean));
  const preview = env.PLAYMOBIL_OFFICIAL_MEDIA_PREVIEW === "1" && env.NODE_ENV === "development" && Boolean(env.PGLITE_DIR);
  return { disabled, reviewedOfficial: !disabled.has("playmobil-official") && (preview || Boolean(env.PLAYMOBIL_OFFICIAL_MEDIA_AUTHORIZATION?.trim())) };
}

export function getReviewedImageVariantIds(policy = getImageDisplayPolicy()) {
  return policy.reviewedOfficial ? [...reviewedByVariant.keys()] : [];
}

export function selectVariantImages(
  variant: VariantImages,
  policy = getImageDisplayPolicy(),
  reviewed = reviewedByVariant.get(variant.id),
): ImageCandidate[] {
  const personal: ImageCandidate[] = [];
  const official: ImageCandidate[] = [];
  const other: ImageCandidate[] = [];
  for (const asset of variant.media) {
    if (asset.canDisplay !== true || policy.disabled.has(asset.source.key.toLowerCase())) continue;
    const url = secureUrl(asset.sourceUrl);
    if (url && policy.disabled.has(url.hostname)) continue;
    if (asset.source.key === "collector-personal" && (url || asset.sourceUrl.startsWith("/collection-photos/"))) {
      personal.push(asset);
    } else if (asset.source.kind === "OFFICIAL") {
      if (!policy.disabled.has("playmobil-official") && url && officialImageHosts.has(url.hostname)) official.push(asset);
    } else if (url && !(policy.disabled.has("klickypedia") && /(^|\.)klickypedia\.com$/.test(url.hostname))) {
      other.push(asset);
    }
  }

  if (policy.reviewedOfficial && reviewed && reviewed.variantId === variant.id
    && reviewed.variantKind === variant.variantKind
    && variant.references.some((ref) => ref.isPrimary && ref.identityClass === "ASSIGNED" && ref.normalizedValue === reviewed.reference)
    && officialPageHosts.has(secureUrl(reviewed.sourcePage)?.hostname ?? "")
    && officialPageHosts.has(secureUrl(reviewed.imageEvidencePage)?.hostname ?? "")
    && officialImageHosts.has(secureUrl(reviewed.image.sourceUrl)?.hostname ?? "")
    && !policy.disabled.has(secureUrl(reviewed.image.sourceUrl)?.hostname ?? "")) {
    official.unshift(reviewed.image);
  }

  const ordered = [...orderMediaForDisplay(personal), ...orderMediaForDisplay(official), ...orderMediaForDisplay(other)];
  const seen = new Set<string>();
  return ordered.flatMap(({ sourceUrl, kind }) => {
    if (seen.has(sourceUrl)) return [];
    seen.add(sourceUrl);
    return [{ sourceUrl, kind }];
  });
}

export function withVariantImages<T extends VariantImages>(variant: T): T & { displayImages: ImageCandidate[] } {
  return { ...variant, displayImages: selectVariantImages(variant) };
}
