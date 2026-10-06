import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getNodeDatabaseClient } from "../lib/db-node";
import { findIdentifierCollisions, isValidGtinChecksum, normalizeProductIdentifier } from "../lib/product-identifiers";

async function main() {
  const auditDir = path.join(process.cwd(), "data", "audit");
  const koup = JSON.parse(await readFile(path.join(auditDir, "koupobol-missing-2026-identifiers.json"), "utf8")) as { entries: Array<{ reference: string; ean: string | null }> };
  const official = JSON.parse(await readFile(path.join(auditDir, "playmobil-official-import-2026.json"), "utf8")) as { observations: Array<{ confirmed: boolean; officialIdentifiers?: Array<{ type: "GTIN" | "MPN" | "OFFICIAL_SKU"; rawValue: string }> }> };
  const db = getNodeDatabaseClient();
  try {
    const tableRows = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public.product_identifiers') IS NOT NULL AS exists`;
    const identifierTableExists = tableRows[0]?.exists ?? false;
    const [implicitValues, implicitPayloads, identifiers] = await Promise.all([
      db.sourceValue.count({ where: { field: { in: ["ean", "gtin", "upc", "mpn", "sku", "barcode"] } } }),
      db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM source_records WHERE raw_payload::text ~* '"(ean|gtin|upc|mpn|sku|barcode)"[[:space:]]*:'`,
      identifierTableExists ? db.productIdentifier.findMany({ include: { product: { select: { id: true, releaseYear: true } }, variant: { select: { productId: true, releaseYear: true, product: { select: { releaseYear: true } } } } } }) : Promise.resolve([]),
    ]);
    const normalizedKoup = koup.entries.flatMap((entry) => {
      if (!entry.ean) return [];
      const normalized = normalizeProductIdentifier("EAN", entry.ean);
      return normalized ? [{ reference: entry.reference, value: normalized, checksumValid: isValidGtinChecksum(normalized) }] : [];
    });
    const officialIdentifiers = official.observations.flatMap((observation) => observation.confirmed ? observation.officialIdentifiers ?? [] : []);
    const collisions = findIdentifierCollisions(identifiers.map((identifier) => ({ type: identifier.type, normalizedValue: identifier.normalizedValue, logicalProductId: identifier.productId ?? identifier.variant!.productId, confidence: identifier.confidence })));
    const distinct = <T>(items: readonly T[]) => new Set(items).size;
    const byYear = Object.fromEntries([2025, 2026].map((year) => {
      const inYear = identifiers.filter((identifier) => (identifier.product?.releaseYear ?? identifier.variant?.releaseYear ?? identifier.variant?.product.releaseYear) === year);
      return [year, { observations: inYear.length, products: distinct(inYear.map((identifier) => identifier.productId ?? identifier.variant!.productId)), values: distinct(inYear.map((identifier) => `${identifier.type}:${identifier.normalizedValue}`)) }];
    }));
    const koupByValue = new Map<string, Set<string>>();
    const koupByReference = new Map<string, Set<string>>();
    for (const identifier of normalizedKoup) {
      const references = koupByValue.get(identifier.value) ?? new Set<string>(); references.add(identifier.reference); koupByValue.set(identifier.value, references);
      const values = koupByReference.get(identifier.reference) ?? new Set<string>(); values.add(identifier.value); koupByReference.set(identifier.reference, values);
    }
    console.log(JSON.stringify({
      implicitInSourceValue: implicitValues,
      implicitInSourceRecordPayload: Number(implicitPayloads[0]?.count ?? 0),
      controlledKoupobolScope: {
        references: koup.entries.length,
        eanObservations: normalizedKoup.length,
        uniqueEan: distinct(normalizedKoup.map((item) => item.value)),
        checksumValid: normalizedKoup.filter((item) => item.checksumValid).length,
        eanSharedByReferences: [...koupByValue].filter(([, references]) => references.size > 1).map(([ean, references]) => ({ ean, references: [...references] })),
        referencesWithMultipleEan: [...koupByReference].filter(([, values]) => values.size > 1).map(([reference, values]) => ({ reference, ean: [...values] })),
      },
      officialSnapshot: { identifierObservations: officialIdentifiers.length, byType: Object.fromEntries(["OFFICIAL_SKU", "GTIN", "MPN"].map((type) => [type, officialIdentifiers.filter((item) => item.type === type).length])) },
      stored: {
        observations: identifiers.length,
        uniqueValues: distinct(identifiers.map((identifier) => `${identifier.type}:${identifier.normalizedValue}`)),
        byType: Object.fromEntries(["EAN", "GTIN", "UPC", "MPN", "OFFICIAL_SKU"].map((type) => [type, identifiers.filter((identifier) => identifier.type === type).length])),
        targets: { product: identifiers.filter((identifier) => identifier.productId).length, variant: identifiers.filter((identifier) => identifier.variantId).length },
        byYear,
        collisions,
      },
      migrationRequired: !identifierTableExists,
    }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
