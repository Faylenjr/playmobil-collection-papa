import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import { auditMergedIdentities } from "../src/jobs/audit-merged-identities.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("merged identity audit job", () => {
  it("reads a merged variant without modifying any database row", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-merged-audit-"));
    directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const product = await db.product.create({ data: { canonicalKey: "ref:80146", baseReference: "80146", kind: "FIGURE" } });
      const variant = await db.productVariant.create({ data: { productId: product.id, canonicalKey: "ref:80146", name: "Example figure", releaseYear: 2024, format: "Figures" } });
      await db.productReference.create({ data: { variantId: variant.id, displayValue: "80146", normalizedValue: "80146", baseValue: "80146", isPrimary: true, sourceId: source.id } });
      for (const suffix of ["page-1", "page-2"]) {
        const sourceRecord = await db.sourceRecord.create({ data: {
          sourceId: source.id, variantId: variant.id, externalId: `sets/80146-${suffix}`,
          sourceUrl: `https://www.klickypedia.com/sets/80146-${suffix}/`, recordType: "collectible", contentHash: suffix,
        } });
        await db.sourceValue.createMany({ data: [
          { sourceId: source.id, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "reference", rawValue: "80146", normalizedValue: "80146", priority: 30 },
          { sourceId: source.id, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "name.en", rawValue: "Example figure", normalizedValue: "Example figure", priority: 30 },
          { sourceId: source.id, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "releaseYear", rawValue: 2024, normalizedValue: 2024, priority: 30 },
          { sourceId: source.id, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "theme", rawValue: "Figures", normalizedValue: "Figures", priority: 30 },
        ] });
      }
      const before = await Promise.all([
        db.product.count(), db.productVariant.count(), db.productReference.count(), db.sourceRecord.count(),
        db.sourceValue.count(), db.reviewTask.count(), db.conflict.count(),
      ]);
      const report = await auditMergedIdentities(db);
      const after = await Promise.all([
        db.product.count(), db.productVariant.count(), db.productReference.count(), db.sourceRecord.count(),
        db.sourceValue.count(), db.reviewTask.count(), db.conflict.count(),
      ]);

      expect(report).toMatchObject({
        dryRun: true, variantsScanned: 1, sourceRecordsScanned: 2, variantsWithMultipleSourceRecords: 1,
        exactMatchGroups: 1, variantsSafeToKeepMerged: 1, predictedNewVariants: 0,
      });
      expect(after).toEqual(before);
    } finally {
      await db.$disconnect();
      await database.close();
    }
  });
});
