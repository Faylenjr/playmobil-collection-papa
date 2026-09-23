import type { Prisma } from "../../generated/prisma/client.js";
import { parseReference } from "../domain/reference.js";
import { resolveCandidates } from "../domain/resolver.js";
import { klickypediaThemeSlug } from "../importers/klickypedia.js";

type JsonScalar = string | number | boolean | null;

export interface RebuildSourceValue {
  id: string;
  sourceId: string;
  field: string;
  rawValue: Prisma.JsonValue;
  normalizedValue: Prisma.JsonValue | null;
  priority: number;
  confidence: Prisma.Decimal;
  retrievedAt: Date;
  source: { key: string };
}

export interface RebuildSourceRecord {
  id: string;
  sourceId: string;
  externalId: string;
  rawPayload: Prisma.JsonValue | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastCheckedAt: Date;
  source: { key: string };
  values: RebuildSourceValue[];
}

export interface CanonicalVariantKeys {
  productKey: string;
  variantKey: string;
}

export interface RebuildCanonicalVariantResult {
  sourceValuesSelected: number;
  conflictsCreated: number;
  referencesCreated: number;
  translationsCreated: number;
  themesCreated: number;
  marketsCreated: number;
}

interface FieldResolution {
  selected: RebuildSourceValue | null;
  conflict: boolean;
  values: RebuildSourceValue[];
}

const scalar = (value: Prisma.JsonValue | null | undefined): JsonScalar => (
  typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null
);

const rawObject = (value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null
);

function resolveFields(records: RebuildSourceRecord[]): Map<string, FieldResolution> {
  const grouped = new Map<string, RebuildSourceValue[]>();
  for (const record of records) for (const value of record.values) {
    const rows = grouped.get(value.field) ?? [];
    rows.push(value);
    grouped.set(value.field, rows);
  }
  const result = new Map<string, FieldResolution>();
  for (const [field, values] of grouped) {
    const resolution = resolveCandidates(values.map((value) => ({
      id: value.id,
      source: value.source.key,
      value: value.normalizedValue,
      priority: value.priority,
      confidence: Number(value.confidence),
      retrievedAt: value.retrievedAt,
    })));
    result.set(field, {
      selected: resolution.selected ? values.find((value) => value.id === resolution.selected!.id) ?? null : null,
      conflict: resolution.conflict,
      values,
    });
  }
  return result;
}

function selectedScalar(fields: Map<string, FieldResolution>, field: string): JsonScalar {
  const value = fields.get(field)?.selected;
  return scalar(value?.normalizedValue ?? value?.rawValue);
}

function selectedString(fields: Map<string, FieldResolution>, field: string): string | null {
  const value = selectedScalar(fields, field);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function selectedNumber(fields: Map<string, FieldResolution>, field: string): number | null {
  const value = selectedScalar(fields, field);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function selectedBoolean(fields: Map<string, FieldResolution>, field: string): boolean | null {
  const value = selectedScalar(fields, field);
  return typeof value === "boolean" ? value : null;
}

function localeFields(fields: Map<string, FieldResolution>): Map<string, { name: string | null; description: string | null }> {
  const locales = new Set<string>();
  for (const field of fields.keys()) {
    const match = field.match(/^(?:name|description)\.(.+)$/);
    if (match?.[1]) locales.add(match[1]);
  }
  return new Map([...locales].sort().map((locale) => [locale, {
    name: selectedString(fields, `name.${locale}`),
    description: selectedString(fields, `description.${locale}`),
  }]));
}

function inferKind(format: string | null, records: RebuildSourceRecord[]) {
  const tags = records.flatMap((record) => {
    const value = rawObject(record.rawPayload)?.tags;
    return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  });
  const signal = `${format ?? ""} ${tags.join(" ")}`.toLowerCase();
  if (/catalog|catalogue|leaflet/.test(signal)) return "CATALOGUE" as const;
  if (/merch|sticker|book|magazine|multimedia/.test(signal)) return "MERCHANDISE" as const;
  if (/promotional|promotion/.test(signal)) return "PROMOTIONAL_ITEM" as const;
  if (/figure|character/.test(signal)) return "FIGURE" as const;
  return "SET" as const;
}

function marketNames(records: RebuildSourceRecord[]): string[] {
  const names = new Set<string>();
  for (const record of records) {
    const value = rawObject(record.rawPayload)?.markets;
    if (Array.isArray(value)) for (const market of value) if (typeof market === "string" && market.trim()) names.add(market.trim());
  }
  return [...names].sort();
}

/**
 * Rebuilds only canonical/derived rows supported by SourceRecord provenance.
 * The caller must move SourceRecord/SourceValue rows first and must separately
 * handle media/instructions/figures/parts after proving their attribution.
 */
export async function rebuildCanonicalVariantFromSourceRecords(
  tx: Prisma.TransactionClient,
  input: {
    variantId: string;
    productId: string;
    keys: CanonicalVariantKeys;
    records: RebuildSourceRecord[];
    identityReason?: string;
  },
): Promise<RebuildCanonicalVariantResult> {
  if (input.records.length === 0) throw new Error(`Cannot rebuild ${input.variantId} without SourceRecords`);
  const fields = resolveFields(input.records);
  const referenceRows = input.records.flatMap((record) => record.values
    .filter((value) => value.field === "reference")
    .map((value) => {
      const display = scalar(value.normalizedValue ?? value.rawValue);
      return typeof display === "string" && display.trim() ? { display: display.trim(), value } : null;
    })
    .filter((row): row is { display: string; value: RebuildSourceValue } => Boolean(row)))
    .sort((left, right) => left.value.priority - right.value.priority
      || Number(right.value.confidence) - Number(left.value.confidence)
      || right.value.retrievedAt.getTime() - left.value.retrievedAt.getTime()
      || left.value.id.localeCompare(right.value.id));
  const referenceByNormalized = new Map<string, { display: string; value: RebuildSourceValue }>();
  for (const reference of referenceRows) {
    const normalized = parseReference(reference.display).normalized;
    if (!referenceByNormalized.has(normalized)) referenceByNormalized.set(normalized, reference);
  }
  const references = [...referenceByNormalized.values()];
  if (references.length === 0) throw new Error(`Cluster for ${input.variantId} has no source reference`);
  const normalizedReferences = new Set(references.map((reference) => parseReference(reference.display).normalized));
  if (normalizedReferences.size !== 1) throw new Error(`Cluster for ${input.variantId} contains multiple normalized references`);
  const selectedReference = selectedString(fields, "reference");
  const primary = parseReference(selectedReference ?? references[0]!.display);

  await tx.sourceValue.updateMany({
    where: { sourceRecordId: { in: input.records.map((record) => record.id) }, entityType: "ProductVariant" },
    data: { entityId: input.variantId, isSelected: false },
  });
  const selectedIds = [...fields.values()].flatMap((resolution) => resolution.selected ? [resolution.selected.id] : []);
  if (selectedIds.length) await tx.sourceValue.updateMany({ where: { id: { in: selectedIds } }, data: { isSelected: true } });

  const translations = localeFields(fields);
  const fallbackName = selectedString(fields, "name.en")
    ?? selectedString(fields, "name")
    ?? [...translations.values()].map((translation) => translation.name).find((name): name is string => Boolean(name))
    ?? null;
  const fallbackDescription = selectedString(fields, "description.en")
    ?? selectedString(fields, "description")
    ?? [...translations.values()].map((translation) => translation.description).find((description): description is string => Boolean(description))
    ?? null;
  const format = selectedString(fields, "format");
  const firstSeenAt = new Date(Math.min(...input.records.map((record) => record.firstSeenAt.getTime())));
  const lastSeenAt = new Date(Math.max(...input.records.map((record) => record.lastSeenAt.getTime())));
  const lastCheckedAt = new Date(Math.max(...input.records.map((record) => record.lastCheckedAt.getTime())));

  await tx.product.update({
    where: { id: input.productId },
    data: {
      canonicalKey: input.keys.productKey,
      baseReference: primary.base,
      kind: inferKind(format, input.records),
      name: fallbackName,
      description: fallbackDescription,
      releaseYear: selectedNumber(fields, "releaseYear"),
      discontinuedYear: selectedNumber(fields, "discontinuedYear"),
    },
  });
  await tx.productVariant.update({
    where: { id: input.variantId },
    data: {
      productId: input.productId,
      canonicalKey: input.keys.variantKey,
      variantKind: primary.signal === "market" ? "MARKET" : primary.signal === "version" || primary.signal === "edition" ? "EDITION" : "STANDARD",
      variantLabel: primary.suffix,
      editionNumber: primary.variantNumber,
      name: fallbackName,
      description: fallbackDescription,
      releaseYear: selectedNumber(fields, "releaseYear"),
      discontinuedYear: selectedNumber(fields, "discontinuedYear"),
      format,
      isCollectible: true,
      isExclusive: selectedBoolean(fields, "isExclusive"),
      isPromotion: selectedBoolean(fields, "isPromotion"),
      releaseDate: null,
      status: selectedString(fields, "status"),
      ageMin: selectedNumber(fields, "ageMin"),
      ageMax: selectedNumber(fields, "ageMax"),
      pieceCount: selectedNumber(fields, "pieceCount"),
      figureCount: selectedNumber(fields, "figureCount"),
      widthMm: selectedNumber(fields, "widthMm"),
      heightMm: selectedNumber(fields, "heightMm"),
      depthMm: selectedNumber(fields, "depthMm"),
      weightGrams: selectedNumber(fields, "weightGrams"),
      partsInventoryComplete: null,
      listPrice: selectedNumber(fields, "listPrice"),
      listPriceCurrency: selectedString(fields, "listPriceCurrency"),
      firstSeenAt,
      lastSeenAt,
      lastCheckedAt,
    },
  });

  await tx.productReference.deleteMany({ where: { variantId: input.variantId } });
  for (const reference of references) {
    const parsed = parseReference(reference.display);
    await tx.productReference.create({ data: {
      variantId: input.variantId,
      displayValue: reference.display,
      normalizedValue: parsed.normalized,
      baseValue: parsed.base,
      suffix: parsed.suffix,
      isPrimary: parsed.normalized === primary.normalized,
      sourceId: reference.value.sourceId,
      identityClass: "REUSED",
      identityReason: input.identityReason ?? "validated-merged-variant-split",
    } });
  }

  await tx.variantTranslation.deleteMany({ where: { variantId: input.variantId } });
  await tx.translation.deleteMany({ where: { productId: input.productId } });
  for (const [locale, translation] of translations) {
    await tx.variantTranslation.create({ data: { variantId: input.variantId, locale, ...translation } });
    await tx.translation.create({ data: { productId: input.productId, locale, ...translation } });
  }

  const themeValues = fields.get("theme")?.values ?? [];
  const selectedTheme = selectedString(fields, "theme");
  const themes = [...new Set(themeValues.map((value) => scalar(value.normalizedValue ?? value.rawValue))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim()))].sort();
  await tx.variantTheme.deleteMany({ where: { variantId: input.variantId } });
  await tx.productTheme.deleteMany({ where: { productId: input.productId } });
  for (const themeName of themes) {
    const theme = await tx.theme.upsert({
      where: { slug: klickypediaThemeSlug(themeName) },
      create: { slug: klickypediaThemeSlug(themeName), name: themeName },
      update: {},
    });
    await tx.variantTheme.create({ data: { variantId: input.variantId, themeId: theme.id, isPrimary: themeName === selectedTheme } });
    await tx.productTheme.create({ data: { productId: input.productId, themeId: theme.id, isPrimary: themeName === selectedTheme } });
  }

  await tx.variantMarket.deleteMany({ where: { variantId: input.variantId } });
  const markets = marketNames(input.records);
  for (const marketName of markets) {
    const code = marketName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16);
    if (!code) continue;
    const market = await tx.market.upsert({ where: { code }, create: { code, name: marketName }, update: {} });
    await tx.variantMarket.create({ data: { variantId: input.variantId, marketId: market.id } });
  }

  let conflictsCreated = 0;
  for (const [field, resolution] of fields) if (resolution.conflict) {
    const conflict = await tx.conflict.create({ data: {
      entityType: "ProductVariant",
      entityId: input.variantId,
      field,
      selectedValueId: resolution.selected?.id ?? null,
    } });
    await tx.conflictValue.createMany({
      data: resolution.values.map((value) => ({ conflictId: conflict.id, sourceValueId: value.id })),
      skipDuplicates: true,
    });
    conflictsCreated += 1;
  }

  return {
    sourceValuesSelected: selectedIds.length,
    conflictsCreated,
    referencesCreated: references.length,
    translationsCreated: translations.size,
    themesCreated: themes.length,
    marketsCreated: markets.length,
  };
}
