import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getNodeDatabaseClient } from "../lib/db-node";
import { findIdentifierCollisions, isValidGtinChecksum, normalizeProductIdentifier, type ProductIdentifierTypeValue } from "../lib/product-identifiers";

type AuditCandidate = { file: string; jsonPath: string; field: string; type: ProductIdentifierTypeValue | "UNCLASSIFIED"; rawValue: string; normalizedValue: string | null; valid: boolean };

function inferredType(field: string): ProductIdentifierTypeValue | "UNCLASSIFIED" | null {
  const key = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["ean", "ean8", "ean13"].includes(key)) return "EAN";
  if (["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "barcode"].includes(key)) return "GTIN";
  if (["upc", "upca"].includes(key)) return "UPC";
  if (key === "mpn") return "MPN";
  if (["sku", "itemsku", "productid"].includes(key)) return "OFFICIAL_SKU";
  return null;
}

function auditValue(file: string, jsonPath: string, field: string, type: ProductIdentifierTypeValue | "UNCLASSIFIED", raw: unknown): AuditCandidate[] {
  if (Array.isArray(raw)) return raw.flatMap((value, index) => auditValue(file, `${jsonPath}[${index}]`, field, type, value));
  if (typeof raw !== "string" && typeof raw !== "number") return [];
  const rawValue = String(raw).trim();
  if (!rawValue) return [];
  const normalizedValue = type === "UNCLASSIFIED" ? null : normalizeProductIdentifier(type, rawValue);
  return [{ file, jsonPath, field, type, rawValue, normalizedValue, valid: normalizedValue !== null }];
}

function extractCandidates(file: string, value: unknown, jsonPath = "$", seen = new Set<unknown>()): AuditCandidate[] {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry, index) => extractCandidates(file, entry, `${jsonPath}[${index}]`, seen));
  const record = value as Record<string, unknown>;
  const candidates: AuditCandidate[] = [];
  if (Array.isArray(record.officialIdentifiers)) {
    for (const [index, entry] of record.officialIdentifiers.entries()) {
      if (!entry || typeof entry !== "object") continue;
      const identifier = entry as Record<string, unknown>;
      const type = typeof identifier.type === "string" && ["EAN", "GTIN", "UPC", "MPN", "OFFICIAL_SKU"].includes(identifier.type)
        ? identifier.type as ProductIdentifierTypeValue : "UNCLASSIFIED";
      candidates.push(...auditValue(file, `${jsonPath}.officialIdentifiers[${index}].rawValue`, "officialIdentifiers", type, identifier.rawValue));
    }
  }
  for (const [field, child] of Object.entries(record)) {
    const type = inferredType(field);
    if (type) candidates.push(...auditValue(file, `${jsonPath}.${field}`, field, type, child));
    if (field !== "officialIdentifiers") candidates.push(...extractCandidates(file, child, `${jsonPath}.${field}`, seen));
  }
  return candidates;
}

async function snapshotAudit(auditDir: string) {
  const files = (await readdir(auditDir)).filter((file) => file.endsWith(".json"));
  const candidates: AuditCandidate[] = [];
  for (const file of files) {
    try { candidates.push(...extractCandidates(file, JSON.parse(await readFile(path.join(auditDir, file), "utf8")))); }
    catch { /* Malformed artifacts are not identifier sources. */ }
  }
  const fingerprint = (item: AuditCandidate) => `${item.type}:${item.normalizedValue ?? item.rawValue}`;
  return {
    filesScanned: files.length,
    valuesFound: candidates.length,
    valid: candidates.filter((item) => item.valid).length,
    invalid: candidates.filter((item) => !item.valid).length,
    uniqueValid: new Set(candidates.filter((item) => item.valid).map(fingerprint)).size,
    byType: Object.fromEntries(["EAN", "GTIN", "UPC", "MPN", "OFFICIAL_SKU", "UNCLASSIFIED"].map((type) => [type, candidates.filter((item) => item.type === type).length])),
    official: candidates.filter((item) => item.file.startsWith("playmobil-official")).reduce((summary, item) => ({ ...summary, [item.type]: (summary[item.type] ?? 0) + 1 }), {} as Record<string, number>),
    koupobolControlled: candidates.filter((item) => item.file.includes("koupobol") && ["EAN", "GTIN", "UPC"].includes(item.type)),
  };
}

async function main() {
  const auditDir = path.join(process.cwd(), "data", "audit");
  const snapshots = await snapshotAudit(auditDir);
  const db = getNodeDatabaseClient();
  try {
    const tableRows = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public.product_identifiers') IS NOT NULL AS exists`;
    const identifierTableExists = tableRows[0]?.exists ?? false;
    const [implicitValues, implicitPayloads, identifiers, coverage] = await Promise.all([
      db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint count FROM source_values WHERE lower(field) ~ '(ean|gtin|upc|mpn|sku|barcode|product.?id)'`,
      db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM source_records WHERE raw_payload::text ~* '"(ean|gtin|upc|mpn|sku|barcode|product.?id)"[[:space:]]*:'`,
      identifierTableExists ? db.productIdentifier.findMany({ include: { product: { select: { id: true, releaseYear: true } }, variant: { select: { productId: true, releaseYear: true, product: { select: { releaseYear: true } } } } } }) : Promise.resolve([]),
      db.$queryRaw<Array<{ segment: string; total: bigint; with_trade_identifier: bigint }>>`
        WITH principal_wishlist AS (
          SELECT DISTINCT wi.variant_id FROM wishlist_items wi JOIN wishlists w ON w.id=wi.wishlist_id JOIN users u ON u.id=w.user_id
          WHERE u.email='collectionneur@playmobil.local' AND w.name='Mes recherches'
        ), active_ebay AS (
          SELECT DISTINCT o.variant_id FROM offers o JOIN retailers r ON r.id=o.retailer_id WHERE o.availability='AVAILABLE' AND o.variant_id IS NOT NULL AND r.slug='ebay-fr'
        ), recent AS (
          SELECT pv.id variant_id FROM product_variants pv JOIN products p ON p.id=pv.product_id
          WHERE COALESCE(pv.release_year,p.release_year)>=2026 ORDER BY pv.release_date DESC NULLS LAST,pv.canonical_key DESC LIMIT 50
        ), segments AS (
          SELECT 'Wishlist' segment,variant_id FROM principal_wishlist UNION ALL SELECT 'eBay actives',variant_id FROM active_ebay
          UNION ALL SELECT 'Nouveautes',variant_id FROM recent
          UNION ALL SELECT '2026',pv.id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE COALESCE(pv.release_year,p.release_year)=2026
        )
        SELECT s.segment,count(DISTINCT s.variant_id)::bigint total,
          count(DISTINCT s.variant_id) FILTER (WHERE EXISTS (
            SELECT 1 FROM product_identifiers pi JOIN product_variants target ON target.id=s.variant_id
            WHERE pi.type IN ('EAN','GTIN','UPC') AND pi.confidence NOT IN ('REJECTED','CONFLICTING') AND (pi.variant_id=s.variant_id OR pi.product_id=target.product_id)
          ))::bigint with_trade_identifier
        FROM segments s GROUP BY s.segment ORDER BY s.segment`,
    ]);
    const collisions = findIdentifierCollisions(identifiers.map((identifier) => ({ type: identifier.type, normalizedValue: identifier.normalizedValue, logicalProductId: identifier.productId ?? identifier.variant!.productId, confidence: identifier.confidence })));
    const distinct = <T>(items: readonly T[]) => new Set(items).size;
    const byYear = Object.fromEntries([2025, 2026].map((year) => {
      const rows = identifiers.filter((identifier) => (identifier.product?.releaseYear ?? identifier.variant?.releaseYear ?? identifier.variant?.product.releaseYear) === year);
      return [year, { observations: rows.length, products: distinct(rows.map((identifier) => identifier.productId ?? identifier.variant!.productId)), values: distinct(rows.map((identifier) => `${identifier.type}:${identifier.normalizedValue}`)) }];
    }));
    const controlled = snapshots.koupobolControlled;
    console.log(JSON.stringify({
      unstructuredDatabase: { sourceValues: Number(implicitValues[0]?.count ?? 0), sourceRecordPayloads: Number(implicitPayloads[0]?.count ?? 0) },
      archivedSnapshots: { filesScanned: snapshots.filesScanned, valuesFound: snapshots.valuesFound, valid: snapshots.valid, invalid: snapshots.invalid, uniqueValid: snapshots.uniqueValid, byType: snapshots.byType, officialByType: snapshots.official },
      controlledKoupobolScope: { observations: controlled.length, valid: controlled.filter((item) => item.valid).length, checksumValid: controlled.filter((item) => item.normalizedValue && isValidGtinChecksum(item.normalizedValue)).length },
      stored: { observations: identifiers.length, uniqueValues: distinct(identifiers.map((identifier) => `${identifier.type}:${identifier.normalizedValue}`)), byType: Object.fromEntries(["EAN", "GTIN", "UPC", "MPN", "OFFICIAL_SKU"].map((type) => [type, identifiers.filter((identifier) => identifier.type === type).length])), targets: { product: identifiers.filter((identifier) => identifier.productId).length, variant: identifiers.filter((identifier) => identifier.variantId).length }, byYear, collisions },
      priorityCoverage: Object.fromEntries(coverage.map((row) => [row.segment, { total: Number(row.total), withEanGtinUpc: Number(row.with_trade_identifier) }])),
      migrationRequired: !identifierTableExists,
    }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
