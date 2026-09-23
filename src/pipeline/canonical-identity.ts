import type { Prisma } from "../../generated/prisma/client.js";
import { stableRecordQualifier } from "../domain/identity.js";

export interface SourceRecordIdentity {
  sourceKey: string;
  externalId: string;
}

const compareStableText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/**
 * Selects one anchor from the complete set of records representing a variant.
 * Sorting the source/external-id pair (rather than choosing the first import)
 * makes the resulting key independent from ingestion order.
 */
export function canonicalRecordQualifier(records: SourceRecordIdentity[]): string {
  if (records.length === 0) throw new Error("Cannot qualify a reused identity without a linked SourceRecord");
  const anchor = [...records].sort((left, right) => compareStableText(
    `${left.sourceKey}\0${left.externalId}`,
    `${right.sourceKey}\0${right.externalId}`,
  ))[0]!;
  return stableRecordQualifier(anchor.sourceKey, anchor.externalId);
}

export function qualifiedIdentityKeys(baseReference: string, normalizedReference: string, records: SourceRecordIdentity[]) {
  const qualifier = canonicalRecordQualifier(records);
  return {
    productKey: `ref:${baseReference}:record:${qualifier}`,
    variantKey: `ref:${normalizedReference}:record:${qualifier}`,
  };
}

/**
 * Atomically promotes an existing variant to its record-qualified identity.
 * A shared Product is split without deleting it; product-level facts are copied
 * so moving one variant cannot strip metadata from either side.
 */
export async function rekeyVariantIdentity(
  tx: Prisma.TransactionClient,
  variantId: string,
  keys: { productKey: string; variantKey: string },
) {
  const variant = await tx.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    include: {
      product: {
        include: {
          _count: { select: { variants: true } },
          translations: true,
          themes: true,
          figures: true,
          parts: true,
        },
      },
    },
  });
  if (variant.canonicalKey === keys.variantKey && variant.product.canonicalKey === keys.productKey) return;

  const occupiedVariant = await tx.productVariant.findUnique({ where: { canonicalKey: keys.variantKey }, select: { id: true } });
  if (occupiedVariant && occupiedVariant.id !== variantId) throw new Error(`Canonical variant key collision: ${keys.variantKey}`);
  const occupiedProduct = await tx.product.findUnique({ where: { canonicalKey: keys.productKey }, select: { id: true } });
  if (occupiedProduct && occupiedProduct.id !== variant.productId) throw new Error(`Canonical product key collision: ${keys.productKey}`);

  let productId = variant.productId;
  if (variant.product.canonicalKey !== keys.productKey) {
    if (variant.product._count.variants === 1) {
      await tx.product.update({ where: { id: variant.productId }, data: { canonicalKey: keys.productKey } });
    } else {
      const cloned = await tx.product.create({
        data: {
          canonicalKey: keys.productKey,
          baseReference: variant.product.baseReference,
          kind: variant.product.kind,
          releaseYear: variant.product.releaseYear,
          discontinuedYear: variant.product.discontinuedYear,
          name: variant.product.name,
          description: variant.product.description,
        },
      });
      productId = cloned.id;
      if (variant.product.translations.length) await tx.translation.createMany({
        data: variant.product.translations.map((row) => ({ productId, locale: row.locale, name: row.name, description: row.description })),
      });
      if (variant.product.themes.length) await tx.productTheme.createMany({
        data: variant.product.themes.map((row) => ({ productId, themeId: row.themeId, isPrimary: row.isPrimary })),
      });
      if (variant.product.figures.length) await tx.productFigure.createMany({
        data: variant.product.figures.map((row) => ({ productId, figureId: row.figureId, quantity: row.quantity })),
      });
      if (variant.product.parts.length) await tx.productPart.createMany({
        data: variant.product.parts.map((row) => ({ productId, partId: row.partId, quantity: row.quantity })),
      });
    }
  }
  await tx.productVariant.update({ where: { id: variantId }, data: { canonicalKey: keys.variantKey, productId } });
}
