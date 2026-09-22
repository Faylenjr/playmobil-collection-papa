import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { canonicalProductKey, canonicalVariantKey, parseReference } from "../domain/reference.js";
import type { RawCollectible } from "../importers/types.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function importRecord(db: PrismaClient, item: RawCollectible): Promise<{ productId: string; variantId: string; changed: boolean }> {
  const parsed = parseReference(item.reference);
  const source = await db.source.findUniqueOrThrow({ where: { key: item.source } });
  const hash = digest(item.raw);
  const previous = await db.sourceRecord.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: item.externalId } } });

  return db.$transaction(async (tx) => {
    const product = await tx.product.upsert({
      where: { canonicalKey: canonicalProductKey(parsed) },
      create: {
        canonicalKey: canonicalProductKey(parsed),
        baseReference: parsed.base,
        ...(item.name !== undefined ? { name: item.name } : {}),
        ...(item.releaseYear !== undefined ? { releaseYear: item.releaseYear } : {}),
      },
      update: {},
    });
    const variant = await tx.productVariant.upsert({
      where: { canonicalKey: canonicalVariantKey(parsed) },
      create: {
        canonicalKey: canonicalVariantKey(parsed),
        productId: product.id,
        variantKind: parsed.signal === "market" ? "MARKET" : parsed.signal === "version" ? "EDITION" : parsed.signal === "edition" ? "EDITION" : "STANDARD",
        variantLabel: parsed.suffix,
        editionNumber: parsed.variantNumber,
      },
      update: { lastSeenAt: new Date(), lastCheckedAt: new Date() },
    });
    await tx.productReference.upsert({
      where: { variantId_normalizedValue: { variantId: variant.id, normalizedValue: parsed.normalized } },
      create: { variantId: variant.id, displayValue: parsed.display, normalizedValue: parsed.normalized, baseValue: parsed.base, suffix: parsed.suffix, isPrimary: true, sourceId: source.id },
      update: { displayValue: parsed.display, sourceId: source.id },
    });
    const record = await tx.sourceRecord.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId: item.externalId } },
      create: { sourceId: source.id, externalId: item.externalId, sourceUrl: item.sourceUrl, recordType: "collectible", rawPayload: item.raw as never, contentHash: hash, sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null },
      update: { sourceUrl: item.sourceUrl, rawPayload: item.raw as never, contentHash: hash, lastSeenAt: new Date(), lastCheckedAt: new Date(), sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null },
    });

    const values: Array<[string, unknown, unknown, number]> = [
      ["reference", item.reference, parsed.normalized, 1],
      ...(item.name ? [["name", item.name, item.name.trim(), 1] as [string, unknown, unknown, number]] : []),
      ...(item.releaseYear ? [["releaseYear", item.releaseYear, item.releaseYear, 1] as [string, unknown, unknown, number]] : []),
      ...(item.discontinuedYear ? [["discontinuedYear", item.discontinuedYear, item.discontinuedYear, 1] as [string, unknown, unknown, number]] : []),
      ...(item.theme ? [["theme", item.theme, item.theme.trim(), 1] as [string, unknown, unknown, number]] : []),
    ];
    await tx.sourceValue.deleteMany({ where: { sourceRecordId: record.id } });
    for (const [field, rawValue, normalizedValue, confidence] of values) {
      await tx.sourceValue.create({ data: { sourceId: source.id, sourceRecordId: record.id, entityType: "Product", entityId: product.id, field, rawValue: rawValue as never, normalizedValue: normalizedValue as never, confidence, priority: source.priority } });
    }
    return { productId: product.id, variantId: variant.id, changed: previous?.contentHash !== hash };
  });
}
