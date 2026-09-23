import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { parseReference } from "../domain/reference.js";
import { resolveIdentityKeys, type IdentitySnapshot } from "../domain/identity.js";
import { resolveCandidates } from "../domain/resolver.js";
import { klickypediaThemeSlug } from "../importers/klickypedia.js";
import type { RawCollectible } from "../importers/types.js";
import { qualifiedIdentityKeys, rekeyVariantIdentity } from "./canonical-identity.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => value as Prisma.InputJsonValue;

export function inferProductKind(item: RawCollectible) {
  const signal = [item.format, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  if (/catalog/.test(signal)) return "CATALOGUE" as const;
  if (/merch|sticker|book|magazine|multimedia/.test(signal)) return "MERCHANDISE" as const;
  if (/promotional|promotion/.test(signal) || item.isPromotion) return "PROMOTIONAL_ITEM" as const;
  if (/figure/.test(signal)) return "FIGURE" as const;
  return "SET" as const;
}

function variantKind(signal: ReturnType<typeof parseReference>["signal"], item: RawCollectible) {
  if (signal === "market") return "MARKET" as const;
  if (signal === "version" || signal === "edition") return "EDITION" as const;
  if (item.isPromotion) return "PROMOTION" as const;
  if (item.isExclusive) return "EXCLUSIVE" as const;
  return "STANDARD" as const;
}

const sourceFacts = (item: RawCollectible) => [
  ["reference", item.reference],
  ["name", item.locale ? undefined : item.name],
  ["releaseYear", item.releaseYear],
  ["discontinuedYear", item.discontinuedYear],
  ["theme", item.theme],
  ["format", item.format],
  ["figureCount", item.figureCount],
  ["pieceCount", item.pieceCount],
  ["ageMin", item.ageMin],
  ["ageMax", item.ageMax],
  ["widthMm", item.widthMm],
  ["heightMm", item.heightMm],
  ["depthMm", item.depthMm],
  ["weightGrams", item.weightGrams],
  ["status", item.status],
  ["listPrice", item.listPrice],
  ["listPriceCurrency", item.listPriceCurrency],
  ["isPromotion", item.isPromotion],
  ["isExclusive", item.isExclusive],
  ...((item.translations ?? []).flatMap((translation) => [
    [`name.${translation.locale}`, translation.name],
    [`description.${translation.locale}`, translation.description],
  ])),
] as Array<[string, unknown]>;

async function syncConflict(tx: Prisma.TransactionClient, entityType: string, entityId: string, field: string) {
  const values = await tx.sourceValue.findMany({ where: { entityType, entityId, field }, include: { source: true } });
  const resolution = resolveCandidates(values.map((value) => ({
    id: value.id,
    source: value.source.key,
    value: value.normalizedValue,
    priority: value.priority,
    confidence: Number(value.confidence),
    retrievedAt: value.retrievedAt,
  })));
  await tx.sourceValue.updateMany({ where: { entityType, entityId, field }, data: { isSelected: false } });
  if (resolution.selected) await tx.sourceValue.update({ where: { id: resolution.selected.id }, data: { isSelected: true } });

  const existing = await tx.conflict.findFirst({ where: { entityType, entityId, field, status: "OPEN" } });
  if (!resolution.conflict) {
    if (existing) await tx.conflict.update({ where: { id: existing.id }, data: { status: "AUTO_RESOLVED", selectedValueId: resolution.selected?.id ?? null, resolvedAt: new Date(), resolutionNote: "All current normalized source values agree." } });
    return { selected: resolution.selected?.value, conflict: false };
  }
  const conflict = existing ?? await tx.conflict.create({ data: { entityType, entityId, field } });
  await tx.conflictValue.createMany({ data: values.map((value) => ({ conflictId: conflict.id, sourceValueId: value.id })), skipDuplicates: true });
  return { selected: resolution.selected?.value, conflict: true };
}

export async function importRecord(db: PrismaClient, item: RawCollectible): Promise<{ productId: string; variantId: string; changed: boolean; conflicts: number }> {
  const parsed = parseReference(item.reference);
  const source = await db.source.findUniqueOrThrow({ where: { key: item.source } });
  const hash = item.contentHash ?? digest(item.raw);
  const previous = await db.sourceRecord.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: item.externalId } } });

  return db.$transaction(async (tx) => {
    const record = await tx.sourceRecord.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId: item.externalId } },
      create: { sourceId: source.id, externalId: item.externalId, sourceUrl: item.sourceUrl, recordType: "collectible", rawPayload: json(item.raw), contentHash: hash, sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null },
      update: { sourceUrl: item.sourceUrl, rawPayload: json(item.raw), contentHash: hash, lastSeenAt: new Date(), lastCheckedAt: new Date(), sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null },
    });
    const candidateRows = record.variantId
      ? await tx.productVariant.findMany({ where: { id: record.variantId }, select: {
        id: true, productId: true, canonicalKey: true, name: true, releaseYear: true, format: true,
        product: { select: { canonicalKey: true, kind: true } },
        themes: { select: { theme: { select: { name: true } } }, orderBy: { isPrimary: "desc" } },
        references: { where: { normalizedValue: parsed.normalized }, take: 1, select: { identityClass: true } },
        sourceRecords: { select: { externalId: true, source: { select: { key: true } } } },
      } })
      : await tx.productVariant.findMany({ where: { references: { some: { normalizedValue: parsed.normalized } } }, select: {
        id: true, productId: true, canonicalKey: true, name: true, releaseYear: true, format: true,
        product: { select: { canonicalKey: true, kind: true } },
        themes: { select: { theme: { select: { name: true } } }, orderBy: { isPrimary: "desc" } },
        references: { where: { normalizedValue: parsed.normalized }, take: 1, select: { identityClass: true } },
        sourceRecords: { select: { externalId: true, source: { select: { key: true } } } },
      } });
    const candidates: IdentitySnapshot[] = candidateRows.map((candidate) => ({
      id: candidate.id,
      productId: candidate.productId,
      productKey: candidate.product.canonicalKey,
      variantKey: candidate.canonicalKey,
      name: candidate.name,
      releaseYear: candidate.releaseYear,
      themes: candidate.themes.map((row) => row.theme.name),
      productKind: candidate.product.kind,
      format: candidate.format,
      referenceClass: candidate.references[0]?.identityClass ?? "ASSIGNED",
    }));
    let identity = record.variantId && candidates[0]
      ? {
        productKey: candidates[0].productKey!, variantKey: candidates[0].variantKey!, matchedCandidate: candidates[0],
        referenceClass: candidates[0].referenceClass ?? "ASSIGNED", needsReview: false as const,
        reason: candidates[0].referenceClass === "PLACEHOLDER" ? "placeholder-reference" as const
          : candidates[0].referenceClass === "REUSED" ? "reused-reference" as const
            : candidates[0].referenceClass === "AMBIGUOUS" ? "true-identity-conflict" as const
              : "assigned-reference" as const,
      }
      : resolveIdentityKeys(item, parsed, candidates);
    if (identity.referenceClass === "REUSED") {
      if (identity.matchedCandidate?.id) {
        const matched = candidateRows.find((candidate) => candidate.id === identity.matchedCandidate!.id)!;
        const keys = qualifiedIdentityKeys(parsed.base, parsed.normalized, [
          ...matched.sourceRecords.map((sourceRecord) => ({ sourceKey: sourceRecord.source.key, externalId: sourceRecord.externalId })),
          { sourceKey: item.source, externalId: item.externalId },
        ]);
        await rekeyVariantIdentity(tx, matched.id, keys);
        identity = { ...identity, ...keys };
      } else {
        // The collision changes the status of the entire reference group. Move
        // every pre-existing object to its own deterministic key before the
        // incoming object is created; the surrounding transaction is atomic.
        for (const candidate of candidateRows) {
          const keys = qualifiedIdentityKeys(parsed.base, parsed.normalized, candidate.sourceRecords.map((sourceRecord) => ({
            sourceKey: sourceRecord.source.key,
            externalId: sourceRecord.externalId,
          })));
          await rekeyVariantIdentity(tx, candidate.id, keys);
        }
      }
    }
    const product = await tx.product.upsert({
      where: { canonicalKey: identity.productKey },
      create: { canonicalKey: identity.productKey, baseReference: parsed.base, kind: inferProductKind(item), name: item.name ?? null, releaseYear: item.releaseYear ?? null, discontinuedYear: item.discontinuedYear ?? null },
      update: {},
    });
    const variant = await tx.productVariant.upsert({
      where: { canonicalKey: identity.variantKey },
      create: {
        canonicalKey: identity.variantKey, productId: product.id, variantKind: variantKind(parsed.signal, item), variantLabel: parsed.suffix,
        editionNumber: parsed.variantNumber, name: item.name ?? null, description: item.description ?? null, releaseYear: item.releaseYear ?? null,
        discontinuedYear: item.discontinuedYear ?? null, format: item.format ?? null, isExclusive: item.isExclusive ?? null, isPromotion: item.isPromotion ?? null,
        figureCount: item.figureCount ?? null, pieceCount: item.pieceCount ?? null, partsInventoryComplete: item.partsInventoryComplete ?? null,
        ageMin: item.ageMin ?? null, ageMax: item.ageMax ?? null, widthMm: item.widthMm ?? null, heightMm: item.heightMm ?? null,
        depthMm: item.depthMm ?? null, weightGrams: item.weightGrams ?? null, status: item.status ?? null,
        listPrice: item.listPrice ?? null, listPriceCurrency: item.listPriceCurrency ?? null,
      },
      update: {
        ...(item.name !== undefined && !item.locale ? { name: item.name } : {}), ...(item.description !== undefined && !item.locale ? { description: item.description } : {}),
        ...(item.releaseYear !== undefined ? { releaseYear: item.releaseYear } : {}), ...(item.discontinuedYear !== undefined ? { discontinuedYear: item.discontinuedYear } : {}),
        ...(item.format !== undefined ? { format: item.format } : {}), ...(item.isExclusive !== undefined ? { isExclusive: item.isExclusive } : {}),
        ...(item.isPromotion !== undefined ? { isPromotion: item.isPromotion } : {}), ...(item.figureCount !== undefined ? { figureCount: item.figureCount } : {}),
        ...(item.pieceCount !== undefined ? { pieceCount: item.pieceCount } : {}), ...(item.partsInventoryComplete !== undefined ? { partsInventoryComplete: item.partsInventoryComplete } : {}),
        ...(item.ageMin !== undefined ? { ageMin: item.ageMin } : {}), ...(item.ageMax !== undefined ? { ageMax: item.ageMax } : {}),
        ...(item.widthMm !== undefined ? { widthMm: item.widthMm } : {}), ...(item.heightMm !== undefined ? { heightMm: item.heightMm } : {}),
        ...(item.depthMm !== undefined ? { depthMm: item.depthMm } : {}), ...(item.weightGrams !== undefined ? { weightGrams: item.weightGrams } : {}),
        ...(item.status !== undefined ? { status: item.status } : {}), ...(item.listPrice !== undefined ? { listPrice: item.listPrice } : {}),
        ...(item.listPriceCurrency !== undefined ? { listPriceCurrency: item.listPriceCurrency } : {}),
        lastSeenAt: new Date(), lastCheckedAt: new Date(),
      },
    });
    if (identity.needsReview) {
      const existingReview = await tx.reviewTask.findFirst({ where: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variant.id, status: "OPEN" } });
      if (!existingReview) await tx.reviewTask.create({
        data: {
          kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variant.id,
          reason: "true-identity-conflict",
          payload: json({ reference: item.reference, source: item.source, externalId: item.externalId, sourceUrl: item.sourceUrl }),
        },
      });
    }
    await tx.productReference.upsert({
      where: { variantId_normalizedValue: { variantId: variant.id, normalizedValue: parsed.normalized } },
      create: { variantId: variant.id, displayValue: parsed.display, normalizedValue: parsed.normalized, baseValue: parsed.base, suffix: parsed.suffix, isPrimary: true, sourceId: source.id, identityClass: identity.referenceClass, identityReason: identity.reason },
      update: { displayValue: parsed.display, sourceId: source.id, identityClass: identity.referenceClass, identityReason: identity.reason },
    });
    if (identity.referenceClass === "REUSED") await tx.productReference.updateMany({
      where: { normalizedValue: parsed.normalized, identityClass: { not: "AMBIGUOUS" } },
      data: { identityClass: "REUSED", identityReason: "reused-reference" },
    });
    await tx.sourceRecord.update({ where: { id: record.id }, data: { variantId: variant.id } });

    await tx.sourceValue.deleteMany({ where: { sourceRecordId: record.id } });
    const fields: string[] = [];
    for (const [field, rawValue] of sourceFacts(item)) {
      if (rawValue === undefined || rawValue === null || rawValue === "") continue;
      const normalizedValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;
      await tx.sourceValue.create({ data: { sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field, rawValue: json(rawValue), normalizedValue: json(normalizedValue), confidence: 1, priority: source.priority } });
      fields.push(field);
    }

    for (const translation of item.translations ?? []) {
      await tx.variantTranslation.upsert({ where: { variantId_locale: { variantId: variant.id, locale: translation.locale } }, create: { variantId: variant.id, locale: translation.locale, name: translation.name ?? null, description: translation.description ?? null }, update: { ...(translation.name !== undefined ? { name: translation.name } : {}), ...(translation.description !== undefined ? { description: translation.description } : {}) } });
      await tx.translation.upsert({ where: { productId_locale: { productId: product.id, locale: translation.locale } }, create: { productId: product.id, locale: translation.locale, name: translation.name ?? null, description: translation.description ?? null }, update: {} });
    }

    for (const themeName of item.themes ?? (item.theme ? [item.theme] : [])) {
      const theme = await tx.theme.upsert({ where: { slug: klickypediaThemeSlug(themeName) }, create: { slug: klickypediaThemeSlug(themeName), name: themeName }, update: {} });
      await tx.variantTheme.upsert({ where: { variantId_themeId: { variantId: variant.id, themeId: theme.id } }, create: { variantId: variant.id, themeId: theme.id, isPrimary: themeName === item.theme }, update: { isPrimary: themeName === item.theme } });
      await tx.productTheme.upsert({ where: { productId_themeId: { productId: product.id, themeId: theme.id } }, create: { productId: product.id, themeId: theme.id, isPrimary: themeName === item.theme }, update: {} });
    }

    for (const marketName of item.markets ?? []) {
      const code = marketName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16);
      if (!code) continue;
      const market = await tx.market.upsert({ where: { code }, create: { code, name: marketName }, update: {} });
      await tx.variantMarket.upsert({ where: { variantId_marketId: { variantId: variant.id, marketId: market.id } }, create: { variantId: variant.id, marketId: market.id }, update: {} });
    }

    for (const image of item.images ?? []) await tx.mediaAsset.upsert({
      where: { variantId_sourceUrl: { variantId: variant.id, sourceUrl: image.url } },
      create: { variantId: variant.id, sourceId: source.id, kind: image.kind, sourceUrl: image.url, author: image.author ?? null, copyrightOwner: image.copyrightOwner ?? null, license: image.license ?? null, canDisplay: image.canDisplay ?? null, canRehost: image.canRehost ?? null, lastVerifiedAt: new Date() },
      update: { kind: image.kind, ...(image.author !== undefined ? { author: image.author } : {}), ...(image.copyrightOwner !== undefined ? { copyrightOwner: image.copyrightOwner } : {}), ...(image.license !== undefined ? { license: image.license } : {}), ...(image.canDisplay !== undefined ? { canDisplay: image.canDisplay } : {}), ...(image.canRehost !== undefined ? { canRehost: image.canRehost } : {}), lastVerifiedAt: new Date() },
    });
    for (const instruction of item.instructions ?? []) await tx.instruction.upsert({ where: { variantId_documentUrl: { variantId: variant.id, documentUrl: instruction.url } }, create: { variantId: variant.id, sourceId: source.id, documentUrl: instruction.url, locale: instruction.locale ?? null, canRehost: false, lastVerifiedAt: new Date() }, update: { ...(instruction.locale !== undefined ? { locale: instruction.locale } : {}), lastVerifiedAt: new Date() } });
    for (const figureData of item.figures ?? []) {
      const figure = await tx.figure.upsert({ where: { canonicalKey: figureData.key }, create: { canonicalKey: figureData.key, name: figureData.name ?? null }, update: { ...(figureData.name !== undefined ? { name: figureData.name } : {}) } });
      await tx.variantFigure.upsert({ where: { variantId_figureId: { variantId: variant.id, figureId: figure.id } }, create: { variantId: variant.id, figureId: figure.id, quantity: figureData.quantity ?? null }, update: { quantity: figureData.quantity ?? null } });
    }
    for (const partData of item.parts ?? []) {
      const part = await tx.part.upsert({ where: { partNumber: partData.partNumber }, create: { partNumber: partData.partNumber, name: partData.name ?? null }, update: { ...(partData.name !== undefined ? { name: partData.name } : {}) } });
      await tx.variantPart.upsert({ where: { variantId_partId: { variantId: variant.id, partId: part.id } }, create: { variantId: variant.id, partId: part.id, quantity: partData.quantity ?? null }, update: { quantity: partData.quantity ?? null } });
    }

    let conflicts = 0;
    const selected = new Map<string, unknown>();
    for (const field of new Set(fields)) {
      const resolution = await syncConflict(tx, "ProductVariant", variant.id, field);
      if (resolution.conflict) conflicts += 1;
      selected.set(field, resolution.selected);
    }
    const selectedNumber = (field: string) => typeof selected.get(field) === "number" ? selected.get(field) as number : undefined;
    const selectedString = (field: string) => typeof selected.get(field) === "string" ? selected.get(field) as string : undefined;
    const selectedBoolean = (field: string) => typeof selected.get(field) === "boolean" ? selected.get(field) as boolean : undefined;
    const canonicalUpdate: Prisma.ProductVariantUncheckedUpdateInput = {};
    const assignString = (field: string, target: "name" | "format" | "status" | "listPriceCurrency") => { const value = selectedString(field); if (value !== undefined) canonicalUpdate[target] = value; };
    const assignNumber = (field: string, target: "releaseYear" | "discontinuedYear" | "figureCount" | "pieceCount" | "ageMin" | "ageMax" | "widthMm" | "heightMm" | "depthMm" | "weightGrams" | "listPrice") => { const value = selectedNumber(field); if (value !== undefined) canonicalUpdate[target] = value; };
    const assignBoolean = (field: string, target: "isExclusive" | "isPromotion") => { const value = selectedBoolean(field); if (value !== undefined) canonicalUpdate[target] = value; };
    assignString("name", "name"); assignString("format", "format"); assignString("status", "status"); assignString("listPriceCurrency", "listPriceCurrency");
    assignNumber("releaseYear", "releaseYear"); assignNumber("discontinuedYear", "discontinuedYear"); assignNumber("figureCount", "figureCount"); assignNumber("pieceCount", "pieceCount");
    assignNumber("ageMin", "ageMin"); assignNumber("ageMax", "ageMax"); assignNumber("widthMm", "widthMm"); assignNumber("heightMm", "heightMm"); assignNumber("depthMm", "depthMm"); assignNumber("weightGrams", "weightGrams"); assignNumber("listPrice", "listPrice");
    assignBoolean("isExclusive", "isExclusive"); assignBoolean("isPromotion", "isPromotion");
    await tx.productVariant.update({ where: { id: variant.id }, data: canonicalUpdate });
    return { productId: product.id, variantId: variant.id, changed: previous?.contentHash !== hash, conflicts };
  });
}
