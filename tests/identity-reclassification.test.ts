import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import { reclassifyIdentities } from "../src/jobs/reclassify-identities.js";
import { importRecord } from "../src/pipeline/import-record.js";
import type { RawCollectible } from "../src/importers/types.js";

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
        await db.productReference.create({ data: { variantId: variant.id, displayValue: reference, normalizedValue: reference.toUpperCase(), baseValue: reference.toUpperCase(), isPrimary: true, sourceId: source.id } });
        await db.sourceRecord.create({ data: {
          sourceId: source.id, variantId: variant.id, externalId: key, sourceUrl: `https://example.test/${key}`,
          recordType: "collectible", contentHash: key,
        } });
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
      for (const variant of [new3133, placeholder, policeNearMatch, police]) await db.reviewTask.create({
        data: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: variant.id, reason: "conflicting-identity-signals" },
      });
      const inReview = await db.reviewTask.create({
        data: { kind: "ambiguous-reference", entityType: "ProductVariant", entityId: policeNearMatch.id, reason: "conflicting-identity-signals", status: "IN_REVIEW" },
      });

      const dryRun = await reclassifyIdentities(db, false);
      expect(dryRun).toMatchObject({ dryRun: true, reusedReferenceGroups: 1, ambiguousReferenceGroups: 1, reviewsResolved: 0 });
      expect(await db.reviewTask.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } })).toBe(5);

      const applied = await reclassifyIdentities(db, true);
      expect(applied).toMatchObject({ dryRun: false, reusedReferenceGroups: 1, ambiguousReferenceGroups: 1, reviewsResolved: 4, trueIdentityReviewsActive: 1 });
      expect(await db.productVariant.count()).toBe(5);
      expect(await db.product.count()).toBe(5);
      expect(await db.productReference.count({ where: { identityClass: "REUSED" } })).toBe(2);
      expect(await db.productReference.count({ where: { identityClass: "PLACEHOLDER" } })).toBe(1);
      expect(await db.productReference.count({ where: { identityClass: "AMBIGUOUS" } })).toBe(2);
      expect(await db.reviewTask.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] }, reason: "true-identity-conflict" } })).toBe(1);
      expect(await db.reviewTask.count({ where: { status: "RESOLVED" } })).toBe(4);
      expect((await db.reviewTask.findUniqueOrThrow({ where: { id: inReview.id } })).status).toBe("IN_REVIEW");
      const redundantReviews = await db.reviewTask.findMany({ where: { reason: "duplicate-identity-review" } });
      expect(redundantReviews).toHaveLength(2);
      expect(redundantReviews.every((task) => task.resolutionNote?.includes(inReview.id))).toBe(true);
      const rekeyed3133 = await db.productVariant.findMany({
        where: { id: { in: [old3133.id, new3133.id] } },
        select: { canonicalKey: true, product: { select: { canonicalKey: true } } },
      });
      expect(rekeyed3133).toHaveLength(2);
      expect(new Set(rekeyed3133.map((variant) => variant.canonicalKey)).size).toBe(2);
      expect(rekeyed3133.every((variant) => variant.canonicalKey.startsWith("ref:3133:record:"))).toBe(true);
      expect(rekeyed3133.every((variant) => variant.product.canonicalKey.startsWith("ref:3133:record:"))).toBe(true);
    } finally {
      await db.$disconnect();
      await database.close();
    }
  });

  const collectible = (externalId: string, name: string, releaseYear: number, theme: string, source = "klickypedia"): RawCollectible => ({
    source,
    externalId,
    sourceUrl: `https://example.test/${source}/${externalId}`,
    reference: "3133",
    name,
    releaseYear,
    theme,
    raw: { externalId, name, releaseYear, theme },
  });

  async function importInOrder(items: RawCollectible[]) {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-identity-order-"));
    directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    await db.source.createMany({ data: [
      { key: "klickypedia", name: "Klickypedia", baseUrl: "https://example.test/k", kind: "COMMUNITY_DATABASE" },
      { key: "official", name: "Official", baseUrl: "https://example.test/o", kind: "OFFICIAL", priority: 10 },
    ] });
    for (const item of items) await importRecord(db, item);
    const rows = await db.sourceRecord.findMany({
      orderBy: [{ source: { key: "asc" } }, { externalId: "asc" }],
      select: { externalId: true, source: { select: { key: true } }, variant: { select: { canonicalKey: true, product: { select: { canonicalKey: true } } } } },
    });
    const result = Object.fromEntries(rows.map((row) => [`${row.source.key}:${row.externalId}`, {
      variantKey: row.variant?.canonicalKey,
      productKey: row.variant?.product.canonicalKey,
    }]));
    await db.$disconnect();
    await database.close();
    return result;
  }

  it("produces the same canonical mapping in either import order while preserving a cross-source MATCH", async () => {
    const goKarts = collectible("go-karts", "Go karts", 1980, "Racing");
    const goKartsOfficial = collectible("official-go-karts", "Go karts", 1980, "Racing", "official");
    const pirates = collectible("pirates-2003", "Special Edition 25 Years Pirates", 2003, "Pirates");
    const forward = await importInOrder([goKarts, goKartsOfficial, pirates]);
    const reverse = await importInOrder([pirates, goKartsOfficial, goKarts]);

    expect(reverse).toEqual(forward);
    expect(forward["klickypedia:go-karts"]).toEqual(forward["official:official-go-karts"]);
    expect(forward["klickypedia:go-karts"]?.variantKey).toMatch(/^ref:3133:record:/);
    expect(forward["klickypedia:pirates-2003"]?.variantKey).toMatch(/^ref:3133:record:/);
    expect(forward["klickypedia:go-karts"]?.variantKey).not.toBe(forward["klickypedia:pirates-2003"]?.variantKey);
  });

  it("produces the same canonical mapping for three reused objects in reverse order", async () => {
    const items = [
      collectible("go-karts", "Go karts", 1980, "Racing"),
      collectible("pirates-2003", "Special Edition 25 Years Pirates", 2003, "Pirates"),
      collectible("police-2020", "Police command centre", 2020, "Police"),
    ];
    const forward = await importInOrder(items);
    const reverse = await importInOrder([...items].reverse());

    expect(reverse).toEqual(forward);
    expect(new Set(Object.values(forward).map((identity) => identity.variantKey)).size).toBe(3);
    expect(Object.values(forward).every((identity) => identity.variantKey?.startsWith("ref:3133:record:"))).toBe(true);
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

  it("aborts the identity migration before DDL when one SourceRecord points to multiple variants", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-identity-migration-"));
    directories.push(directory);
    const database = new PGlite({ dataDir: directory });
    await database.waitReady;
    try {
      for (const migration of ["20260922190000_init", "20260922204500_variant_metadata"]) {
        await database.exec(await readFile(join(process.cwd(), "prisma/migrations", migration, "migration.sql"), "utf8"));
      }
      await database.exec(`
        INSERT INTO sources (id, key, name, base_url, kind)
          VALUES ('00000000-0000-0000-0000-000000000001', 'test', 'Test', 'https://example.test', 'COMMUNITY_DATABASE');
        INSERT INTO products (id, canonical_key, updated_at) VALUES
          ('00000000-0000-0000-0000-000000000011', 'ref:a', now()),
          ('00000000-0000-0000-0000-000000000012', 'ref:b', now());
        INSERT INTO product_variants (id, product_id, canonical_key, updated_at) VALUES
          ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'ref:a', now()),
          ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000012', 'ref:b', now());
        INSERT INTO source_records (id, source_id, external_id, source_url, record_type, content_hash)
          VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'record', 'https://example.test/record', 'collectible', 'hash');
        INSERT INTO source_values (id, source_id, source_record_id, entity_type, entity_id, field, raw_value, priority) VALUES
          ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'ProductVariant', '00000000-0000-0000-0000-000000000021', 'name', '"A"'::jsonb, 100),
          ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'ProductVariant', '00000000-0000-0000-0000-000000000022', 'releaseYear', '2000'::jsonb, 100);
      `);
      const identityMigration = await readFile(join(process.cwd(), "prisma/migrations/20260923133000_reference_identity/migration.sql"), "utf8");
      await expect(database.exec(identityMigration)).rejects.toThrow(/points to multiple ProductVariant identities/);
      const columns = await database.query<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'source_records' AND column_name = 'variant_id'
      `);
      expect(columns.rows).toHaveLength(0);
    } finally {
      await database.close();
    }
  });
});
