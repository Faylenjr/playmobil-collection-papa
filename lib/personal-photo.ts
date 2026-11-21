export const MAX_PHOTO_UPLOAD = 12 * 1024 * 1024;
export const MAX_STORED_PHOTO = 1536 * 1024;
export const PERSONAL_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_REVISION = /^[0-9a-f]{64}$/;
export const PHOTO_VARIANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PERSONAL_PHOTO_SOURCE = "collector-personal";

export function personalPhotoUrl(variantId: string) {
  return `/collection-photos/${variantId}`;
}
