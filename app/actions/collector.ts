"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCollectorContext } from "../../lib/collector";
import { parseTriState } from "../../lib/collection-management";

const variantIdSchema = z.string().uuid();

function refreshCollectorViews() {
  revalidatePath("/", "layout");
}

export async function addToCollection(variantId: string) {
  const id = variantIdSchema.parse(variantId);
  const { db, collection } = await getCollectorContext(true);
  if (!collection) throw new Error("Collection principale introuvable");
  await db.productVariant.findUniqueOrThrow({ where: { id }, select: { id: true } });
  await db.collectionItem.upsert({ where: { collectionId_variantId: { collectionId: collection.id, variantId: id } }, update: {}, create: { collectionId: collection.id, variantId: id } });
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
  const optionalBoolean = (name: string) => parseOptionalBoolean(formData.get(name));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const purchaseDate = parseOptionalDate(formData.get("purchaseDate"));
  const purchasePrice = parseOptionalPrice(formData.get("purchasePrice"));
  const currency = purchasePrice === null ? null : z.string().trim().toUpperCase().length(3).catch("EUR").parse(formData.get("currency") ?? "EUR");
  await db.collectionItem.update({
    where: { collectionId_variantId: { collectionId: collection.id, variantId: id } },
    data: { quantity, condition, isComplete: optionalBoolean("isComplete"), hasBox: optionalBoolean("hasBox"), hasInstructions: optionalBoolean("hasInstructions"), purchaseDate, purchasePrice, currency, notes },
  });
  refreshCollectorViews();
}

export type CollectionActionState = { ok: boolean; message: string };
export type InventoryActionState = CollectionActionState & {
  revision: number;
  saved?: { condition: string; isComplete: boolean | null; hasBox: boolean | null; hasInstructions: boolean | null; notes: string | null };
};

export async function updateInventoryItemState(variantId: string, previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    const id = variantIdSchema.parse(variantId);
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
    await db.collectionItem.update({
      where: { collectionId_variantId: { collectionId: collection.id, variantId: id } },
      data: saved,
    });
    refreshCollectorViews();
    return { ok: true, message: "Enregistré. Passage à l’objet suivant…", revision: previous.revision + 1, saved };
  } catch {
    return { ok: false, message: "Impossible d’enregistrer. Aucune donnée n’a été modifiée.", revision: previous.revision + 1 };
  }
}

export async function updateCollectionItemState(variantId: string, _previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    await updateCollectionItem(variantId, formData);
    return { ok: true, message: "Modifications enregistrées." };
  } catch {
    return { ok: false, message: "Impossible d’enregistrer. Réessayez." };
  }
}

export async function addToCollectionWithDetails(variantId: string, _previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    await addToCollection(variantId);
    const hasDetails = ["quantity", "condition", "isComplete", "hasBox", "hasInstructions", "purchaseDate", "purchasePrice", "notes"].some((name) => formData.has(name));
    if (hasDetails) await updateCollectionItem(variantId, formData);
    return { ok: true, message: "Ajouté à la collection. Les champs laissés vides restent inconnus." };
  } catch {
    return { ok: false, message: "Impossible d’ajouter cet objet." };
  }
}

export async function bulkUpdateCollectionItems(_previous: CollectionActionState, formData: FormData): Promise<CollectionActionState> {
  try {
    const itemIds = [...new Set(formData.getAll("itemIds").map(String))].map((value) => variantIdSchema.parse(value));
    if (!itemIds.length) return { ok: false, message: "Sélectionnez au moins un objet." };
    const field = z.enum(["condition", "isComplete", "hasBox", "hasInstructions"]).parse(formData.get("field"));
    const { db, collection } = await getCollectorContext(true);
    if (!collection) throw new Error("Collection principale introuvable");
    const owned = await db.collectionItem.findMany({ where: { id: { in: itemIds }, collectionId: collection.id }, select: { id: true } });
    if (owned.length !== itemIds.length) throw new Error("Sélection invalide");
    const data = field === "condition"
      ? { condition: z.enum(["SEALED", "NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "UNKNOWN"]).parse(formData.get("condition")) }
      : { [field]: parseOptionalBoolean(formData.get("booleanValue")) };
    await db.$transaction(itemIds.map((id) => db.collectionItem.update({ where: { id }, data })));
    refreshCollectorViews();
    return { ok: true, message: `${itemIds.length} objet${itemIds.length > 1 ? "s" : ""} modifié${itemIds.length > 1 ? "s" : ""}.` };
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

export async function updateWishlistItem(variantId: string, formData: FormData) {
  const id = variantIdSchema.parse(variantId);
  const { db, wishlist } = await getCollectorContext(true);
  if (!wishlist) throw new Error("Liste de recherches introuvable");
  const priority = Math.max(0, Math.min(3, Number.parseInt(String(formData.get("priority") ?? "0"), 10) || 0));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  await db.wishlistItem.update({ where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: id } }, data: { priority, notes } });
  refreshCollectorViews();
}
