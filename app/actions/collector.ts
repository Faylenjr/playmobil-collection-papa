"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCollectorContext } from "../../lib/collector";
import { parseTriState } from "../../lib/collection-management";

const variantIdSchema = z.string().uuid();
const copyIdSchema = z.string().uuid();

function refreshCollectorViews() {
  revalidatePath("/", "layout");
}

export async function addToCollection(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection } = await getCollectorContext(true);
  if (!collection) throw new Error("Collection principale introuvable");
  await db.productVariant.findUniqueOrThrow({ where: { id }, select: { id: true } });
  await db.$transaction(async (tx) => {
    const item = await tx.collectionItem.upsert({ where: { collectionId_variantId: { collectionId: collection.id, variantId: id } }, update: {}, create: { collectionId: collection.id, variantId: id } });
    await tx.collectionCopy.create({ data: { collectionItemId: item.id } });
  });
  refreshCollectorViews();
}

export async function deleteCollectionCopy(copyId: string) {
  const id = copyIdSchema.parse(copyId);
  const { db, collection } = await getCollectorContext();
  if (!collection) throw new Error("Collection principale introuvable");
  await db.$transaction(async (tx) => {
    const copy = await tx.collectionCopy.findFirstOrThrow({ where: { id, collectionItem: { collectionId: collection.id } }, select: { collectionItemId: true } });
    await tx.collectionCopy.delete({ where: { id } });
    const remaining = await tx.collectionCopy.count({ where: { collectionItemId: copy.collectionItemId } });
    if (remaining === 0) await tx.collectionItem.delete({ where: { id: copy.collectionItemId } });
  });
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

export async function updateCollectionCopy(copyId: string, formData: FormData) {
  const id = copyIdSchema.parse(copyId);
  const { db, collection } = await getCollectorContext(true);
  if (!collection) throw new Error("Collection principale introuvable");
  const data = parseCopyData(formData);
  const owned = await db.collectionCopy.findFirst({ where: { id, collectionItem: { collectionId: collection.id } }, select: { id: true } });
  if (!owned) throw new Error("Exemplaire introuvable");
  await db.collectionCopy.update({ where: { id }, data });
  refreshCollectorViews();
}

export type CollectionActionState = { ok: boolean; message: string };
export type InventoryActionState = CollectionActionState & {
  revision: number;
  saved?: { condition: string; isComplete: boolean | null; hasBox: boolean | null; hasInstructions: boolean | null; notes: string | null };
};

export async function updateInventoryItemState(copyId: string, previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    const id = copyIdSchema.parse(copyId);
    const condition = z.enum(["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]).parse(formData.get("condition"));
    const saved = {
      condition,
      isComplete: parseOptionalBoolean(formData.get("isComplete")),
      hasBox: parseOptionalBoolean(formData.get("hasBox")),
      hasInstructions: parseOptionalBoolean(formData.get("hasInstructions")),
      notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
    };
    const { db, collection } = await getCollectorContext();
    if (!collection) throw new Error("Collection principale introuvable");
    const owned = await db.collectionCopy.findFirst({ where: { id, collectionItem: { collectionId: collection.id } }, select: { id: true } });
    if (!owned) throw new Error("Exemplaire introuvable");
    await db.collectionCopy.update({ where: { id }, data: saved });
    refreshCollectorViews();
    return { ok: true, message: "Enregistré. Passage à l’objet suivant…", revision: previous.revision + 1, saved };
  } catch {
    return { ok: false, message: "Impossible d’enregistrer. Aucune donnée n’a été modifiée.", revision: previous.revision + 1 };
  }
}

export async function updateCollectionCopyState(copyId: string, _previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    await updateCollectionCopy(copyId, formData);
    return { ok: true, message: "Modifications enregistrées." };
  } catch {
    return { ok: false, message: "Impossible d’enregistrer. Réessayez." };
  }
}

export async function addToCollectionWithDetails(variantId: string, _previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    const id = variantIdSchema.parse(variantId);
    const { db, collection } = await getCollectorContext(true);
    if (!collection) throw new Error("Collection principale introuvable");
    await db.productVariant.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const data = parseCopyData(formData);
    await db.$transaction(async (tx) => {
      const item = await tx.collectionItem.upsert({ where: { collectionId_variantId: { collectionId: collection.id, variantId: id } }, update: {}, create: { collectionId: collection.id, variantId: id } });
      await tx.collectionCopy.create({ data: { collectionItemId: item.id, ...data } });
    });
    refreshCollectorViews();
    return { ok: true, message: "Nouvel exemplaire ajouté. Les champs laissés vides restent inconnus." };
  } catch {
    return { ok: false, message: "Impossible d’ajouter cet objet." };
  }
}

export async function bulkUpdateCollectionItems(_previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    const copyIds = [...new Set(formData.getAll("copyIds").map(String))].map((value) => copyIdSchema.parse(value));
    if (!copyIds.length) return { ok: false, message: "Sélectionnez au moins un exemplaire." };
    const field = z.enum(["condition", "isComplete", "hasBox", "hasInstructions"]).parse(formData.get("field"));
    const { db, collection } = await getCollectorContext(true);
    if (!collection) throw new Error("Collection principale introuvable");
    const owned = await db.collectionCopy.findMany({ where: { id: { in: copyIds }, collectionItem: { collectionId: collection.id } }, select: { id: true } });
    if (owned.length !== copyIds.length) throw new Error("Sélection invalide");
    const data = field === "condition"
      ? { condition: z.enum(["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]).parse(formData.get("condition")) }
      : { [field]: parseOptionalBoolean(formData.get("booleanValue")) };
    await db.$transaction(copyIds.map((id) => db.collectionCopy.update({ where: { id }, data })));
    refreshCollectorViews();
    return { ok: true, message: `${copyIds.length} exemplaire${copyIds.length > 1 ? "s" : ""} modifié${copyIds.length > 1 ? "s" : ""}.` };
  } catch {
    return { ok: false, message: "La modification en série n’a pas été appliquée." };
  }
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  return parseTriState(value);
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalPrice(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) throw new Error("Prix invalide");
  return amount.toFixed(2);
}

function parseCopyData(formData: FormData) {
  const condition = z.enum(["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]).catch("UNKNOWN").parse(formData.get("condition"));
  const purchasePrice = parseOptionalPrice(formData.get("purchasePrice"));
  return {
    condition,
    isComplete: parseOptionalBoolean(formData.get("isComplete")),
    hasBox: parseOptionalBoolean(formData.get("hasBox")),
    hasInstructions: parseOptionalBoolean(formData.get("hasInstructions")),
    purchaseDate: parseOptionalDate(formData.get("purchaseDate")),
    purchasePrice,
    currency: purchasePrice === null ? null : z.string().trim().toUpperCase().length(3).catch("EUR").parse(formData.get("currency") ?? "EUR"),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000) || null,
  };
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
