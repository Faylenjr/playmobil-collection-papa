import type { PrismaClient } from "../generated/prisma/client";
import { personalPhotoUrl, PERSONAL_PHOTO_SOURCE } from "./personal-photo";

export async function savePersonalPhoto(
  db: PrismaClient, variantId: string, data: Uint8Array<ArrayBuffer>, revision: string, previous: string | null,
) {
  return db.$transaction(async (tx) => {
    if (previous === null) {
      await tx.personalPhoto.create({ data: { variantId, data, revision } });
    } else {
      const { count } = await tx.personalPhoto.updateMany({
        where: { variantId, revision: previous },
        data: { data, revision },
      });
      if (!count) return false;
    }
    const source = await tx.source.findUniqueOrThrow({
      where: { key: PERSONAL_PHOTO_SOURCE },
      select: { id: true },
    });
    const sourceUrl = personalPhotoUrl(variantId);
    await tx.mediaAsset.upsert({
      where: { variantId_sourceUrl: { variantId, sourceUrl } },
      create: { variantId, sourceUrl, sourceId: source.id, kind: "main", canDisplay: true, contentHash: revision },
      update: { sourceId: source.id, canDisplay: true, contentHash: revision },
    });
    return true;
  });
}

export async function removePersonalPhoto(db: PrismaClient, variantId: string, revision: string) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.personalPhoto.deleteMany({ where: { variantId, revision } });
    if (!count) return false;
    await tx.mediaAsset.deleteMany({
      where: { variantId, sourceUrl: personalPhotoUrl(variantId), source: { key: PERSONAL_PHOTO_SOURCE } },
    });
    return true;
  });
}
