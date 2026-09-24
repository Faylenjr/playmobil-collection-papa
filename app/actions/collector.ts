"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCollectorContext } from "../../lib/collector";

const variantIdSchema = z.string().uuid();

function refreshCollectorViews() {
  revalidatePath("/", "layout");
}

export async function addToCollection(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection, wishlist } = await getCollectorContext(true);
  if (!collection) throw new Error("Collection principale introuvable");
  await db.productVariant.findUniqueOrThrow({ where: { id }, select: { id: true } });
  await db.$transaction([
    db.collectionItem.upsert({ where: { collectionId_variantId: { collectionId: collection.id, variantId: id } }, update: {}, create: { collectionId: collection.id, variantId: id } }),
    ...(wishlist ? [db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, variantId: id } })] : []),
  ]);
  refreshCollectorViews();
}

export async function removeFromCollection(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection } = await getCollectorContext();
  if (collection) await db.collectionItem.deleteMany({ where: { collectionId: collection.id, variantId: id } });
  refreshCollectorViews();
}

export async function addToWishlist(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection, wishlist } = await getCollectorContext(true);
  if (!wishlist) throw new Error("Liste de recherches introuvable");
  const owned = collection ? await db.collectionItem.findUnique({ where: { collectionId_variantId: { collectionId: collection.id, variantId: id } }, select: { id: true } }) : null;
  if (!owned) await db.wishlistItem.upsert({ where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: id } }, update: {}, create: { wishlistId: wishlist.id, variantId: id } });
  refreshCollectorViews();
}

export async function removeFromWishlist(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, wishlist } = await getCollectorContext();
  if (wishlist) await db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, variantId: id } });
  refreshCollectorViews();
}

export async function updateCollectionItem(variantId: string, formData: FormData) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection } = await getCollectorContext(true);
  if (!collection) throw new Error("Collection principale introuvable");
  const quantity = Math.max(1, Math.min(999, Number.parseInt(String(formData.get("quantity") ?? "1"), 10) || 1));
  const condition = z.enum(["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]).catch("UNKNOWN").parse(formData.get("condition"));
  const optionalBoolean = (name: string) => formData.get(name) === "unknown" ? null : formData.get(name) === "yes";
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  await db.collectionItem.update({
    where: { collectionId_variantId: { collectionId: collection.id, variantId: id } },
    data: { quantity, condition, isComplete: optionalBoolean("isComplete"), hasBox: optionalBoolean("hasBox"), hasInstructions: optionalBoolean("hasInstructions"), notes },
  });
  refreshCollectorViews();
}

export async function updateWishlistItem(variantId: string, formData: FormData) {
  const id = variantIdSchema.parse(variantId);
  const { db, wishlist } = await getCollectorContext(true);
  if (!wishlist) throw new Error("Liste de recherches introuvable");
  const priority = Math.max(0, Math.min(3, Number.parseInt(String(formData.get("priority") ?? "0"), 10) || 0));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  await db.wishlistItem.update({ where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: id } }, data: { priority, notes } });
  refreshCollectorViews();
}
