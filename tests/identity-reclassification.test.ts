import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import { reclassifyIdentities } from "../src/jobs/reclassify-identities.js";
import { importRecord } from "../src/pipeline/import-record.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("identity reclassification", () => {
  it("resolves expected placeholders and reused references without deleting variants", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-identity-"));
    directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      const source = await db.source.create({ data: { key: "test", name: "Test", baseUrl: "https://example.test", kind: "COMMUNITY_DATABASE" } });
      const theme = await db.theme.create({ data: { slug: "police", name: "Police" } });
      const createVariant = async (key: string, reference: string, name: string, releaseYear: number | null, kind: "SET" | "FIGURE" | "CATALOGUE" = "SET") => {
        const product = await db.product.create({ data: { canonicalKey: `${key}:product`, baseReference: reference, kind } });
        const variant = await db.productVariant.create({ data: { canonicalKey: key, productId: product.id, name, releaseYear } });
        await db.productReference.create({ data: { variantId: variant.id, displayValue: reference, normalizedValue: reference.toUpperCase(), isPrimary: true, sourceId: source.id } });
        return variant;
      };
      const old3133 = await createVariant("ref:3133", "3133", "Go karts", 1980);
      const new3133 = await createVariant("ref:3133:record:new", "3133", "Special Edition 25 Years Pirates", 2003);
      const placeholder = await createVariant("ref:00000:record:a", "00000", "Knight", null);
      const police = await createVariant("ref:1234", "1234", "Police car", 2001);
      const policeNearMatch = await createVariant("ref:1234:record:b", "1234", "Police car set", 2001);
      await db.variantTheme.createMany({ data: [
        { variantId: police.id, themeId: theme.id, isPrimary: true },
        { variantId: policeNearMatch.id, themeId: theme.id, isPrimary: true },
      ] });
      for (const variant of [new3133, placeholder, policeNearMatch]) await db.reviewTask.create({
        data: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variant.id, reason: "conflicting-identity-signals" },
      });

      const dryRun = await reclassifyIdentities(db, false);
      expect(dryRun).toMatchObject({ dryRun: true, reusedReferenceGroups: 1, ambiguousReferenceGroups: 1, reviewsResolved: 0 });
      expect(await db.reviewTask.count({ where: { status: "OPEN" } })).toBe(3);

      const applied = await reclassifyIdentities(db, true);
      expect(applied).toMatchObject({ dryRun: false, reusedReferenceGroups: 1, ambiguousReferenceGroups: 1, reviewsResolved: 2 });
      expect(await db.productVariant.count()).toBe(5);
      expect(await db.product.count()).toBe(5);
      expect(await db.productReference.count({ where: { identityClass: "REUSED" } })).toBe(2);
      expect(await db.productReference.count({ where: { identityClass: "PLACEHOLDER" } })).toBe(1);
      expect(await db.productReference.count({ where: { identityClass: "AMBIGUOUS" } })).toBe(2);
      expect(await db.reviewTask.count({ where: { status: "OPEN", reason: "true-identity-conflict" } })).toBe(1);
      expect(await db.reviewTask.count({ where: { status: "RESOLVED" } })).toBe(2);
      expect(await db.productVariant.findUnique({ where: { id: old3133.id } })).not.toBeNull();
    } finally {
      await db.$disconnect();
      await database.close();
    }
  });

  it("keeps a SourceRecord attached to the same variant across changed reimports", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-identity-resume-"));
    directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      await db.source.create({
        data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" },
      });
      const first = await importRecord(db, {
        source: "klickypedia",
        externalId: "https://www.klickypedia.com/sets/5555-farm/",
        sourceUrl: "https://www.klickypedia.com/sets/5555-farm/",
        reference: "5555",
        name: "Farm",
        releaseYear: 1990,
        theme: "Farm",
        raw: { version: 1 },
      });
      const second = await importRecord(db, {
        source: "klickypedia",
        externalId: "https://www.klickypedia.com/sets/5555-farm/",
        sourceUrl: "https://www.klickypedia.com/sets/5555-farm/",
        reference: "5555",
        name: "Farm corrected",
        releaseYear: 1991,
        theme: "Country",
        raw: { version: 2 },
      });

      expect(second.variantId).toBe(first.variantId);
      expect(await db.productVariant.count()).toBe(1);
      expect(await db.reviewTask.count()).toBe(0);
      const record = await db.sourceRecord.findFirstOrThrow();
      expect(record.variantId).toBe(first.variantId);
      expect(record.contentHash).not.toBeNull();
    } finally {
      await db.$disconnect();
      await database.close();
    }
  });
});
