import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import { auditMergedIdentities } from "../src/jobs/audit-merged-identities.js";
import { repairMergedIdentities } from "../src/jobs/repair-merged-identities.js";
import { reclassifyIdentities } from "../src/jobs/reclassify-identities.js";
import { qualifiedIdentityKeys } from "../src/pipeline/canonical-identity.js";
import { repairPlanHash } from "../src/domain/merged-repair-plan.js";
import { KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL } from "../src/domain/source-media.js";

const directories: string[] = [];
let fixtureSequence = 0;
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

interface RecordFixture {
  slug: string;
  name: string;
  names?: Record<string, string>;
}

interface GroupFixture {
  reference: string;
  records: RecordFixture[];
  year?: number;
  theme?: string;
  format?: string;
}

async function database(name: string) {
  const directory = await mkdtemp(join(tmpdir(), `playmobil-${name}-`));
  directories.push(directory);
  return createEmbeddedDatabaseClient(directory);
}

async function seedGroup(db: PrismaClient, sourceId: string, fixture: GroupFixture) {
  fixtureSequence += 1;
  const product = await db.product.create({ data: {
    canonicalKey: `legacy-product:${fixture.reference}:${fixtureSequence}`,
    baseReference: fixture.reference,
    kind: "SET",
    name: "contaminated product",
  } });
  const variant = await db.productVariant.create({ data: {
    productId: product.id,
    canonicalKey: `legacy-variant:${fixture.reference}:${fixtureSequence}`,
    name: "contaminated variant",
    releaseYear: fixture.year ?? 2005,
    format: fixture.format ?? "Blister",
  } });
  await db.productReference.create({ data: {
    variantId: variant.id,
    displayValue: fixture.reference,
    normalizedValue: fixture.reference.toUpperCase(),
    baseValue: fixture.reference.toUpperCase().replace(/-GER$/i, ""),
    isPrimary: true,
    sourceId,
  } });
  const records = [];
  for (const item of fixture.records) {
    const externalId = `sets/${fixture.reference.toLowerCase()}-${item.slug}`;
    const sourceRecord = await db.sourceRecord.create({ data: {
      sourceId,
      variantId: variant.id,
      externalId,
      sourceUrl: `https://www.klickypedia.com/${externalId}/`,
      recordType: "collectible",
      contentHash: `hash:${fixture.reference}:${item.slug}`,
      rawPayload: { markets: [], tags: [] },
    } });
    const names = item.names ?? { en: item.name };
    await db.sourceValue.createMany({ data: [
      { sourceId, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "reference", rawValue: fixture.reference, normalizedValue: fixture.reference, priority: 30 },
      ...Object.entries(names).map(([locale, name]) => ({
        sourceId, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id,
        field: `name.${locale}`, rawValue: name, normalizedValue: name, priority: 30,
      })),
      { sourceId, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "releaseYear", rawValue: fixture.year ?? 2005, normalizedValue: fixture.year ?? 2005, priority: 30 },
      { sourceId, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "theme", rawValue: fixture.theme ?? "Test", normalizedValue: fixture.theme ?? "Test", priority: 30 },
      { sourceId, sourceRecordId: sourceRecord.id, entityType: "ProductVariant", entityId: variant.id, field: "format", rawValue: fixture.format ?? "Blister", normalizedValue: fixture.format ?? "Blister", priority: 30 },
    ] });
    records.push(sourceRecord);
  }
  return { product, variant, records };
}

const translated = (en: string, de: string, es: string, fr: string) => ({ en, de, es, fr });

const approvedFixtures: GroupFixture[] = [
  { reference: "30791393", records: [
    { slug: "small-tiger", name: "Small Tiger", names: translated("Small Tiger", "Kleiner Tiger", "Tigre pequeño", "Petit tigre") },
    { slug: "rangers", name: "Rangers", names: translated("Rangers", "Ranger", "Guardabosques", "Gardes forestiers") },
  ] },
  { reference: "30883802-GER", theme: "Waterworld", records: [
    { slug: "genie", name: "Genie", names: translated("Genie", "Flaschengeist", "Genio de la lámpara", "Génie de la lampe") },
    { slug: "mermaid", name: "Mermaid", names: translated("Mermaid", "Meerjungfrau", "Sirena", "Sirène") },
  ] },
  { reference: "30825013-GER", format: "Promotional item", records: ["green", "yellow", "blue", "gold", "red", "white"].map((color) => ({ slug: color, name: `Playmobil Share the Smile 40º (${color})` })) },
  { reference: "3975-GER", records: ["Green", "Orange", "Red"].map((color) => ({ slug: `${color.toLowerCase()}-easter-egg`, name: `${color} Easter egg` })) },
  { reference: "3080062", format: "Leaflet", records: ["Zoo", "City Life", "Farm"].map((cover) => ({ slug: `cover-${cover.toLowerCase().replace(/ /g, "-")}`, name: `Leaflet - Cover ${cover}` })) },
  { reference: "30898192", format: "Leaflet", records: ["Knight's Empire Castle", "Knights"].map((cover) => ({ slug: `cover-${cover.toLowerCase().replace(/[^a-z]+/g, "-")}`, name: `Leaflet - Cover ${cover}` })) },
  { reference: "71761V6", records: [
    { slug: "demoness", name: "Demoness", names: translated("Demoness", "Dämonin", "Demonia", "Démone") },
    { slug: "vampire", name: "Vampire", names: translated("Vampire", "Vampir", "Vampiro", "Vampire") },
  ] },
  { reference: "3080062S3", format: "Leaflet", records: ["Petrol Station", "Polar Station", "Riding Stables"].map((cover) => ({ slug: `cover-${cover.toLowerCase().replace(/ /g, "-")}`, name: `Leaflet - Cover ${cover}` })) },
];

async function seedApprovedPlan(db: PrismaClient) {
  const source = await db.source.create({ data: {
    key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE", priority: 30,
  } });
  const groups = [];
  for (const fixture of approvedFixtures) groups.push(await seedGroup(db, source.id, fixture));
  return { source, groups, plan: await auditMergedIdentities(db) };
}

describe("merged identity repair", () => {
  it("materializes the eight approved groups into 23 clean deterministic variants", async () => {
    const { db, database: embedded } = await database("repair-approved");
    try {
      const { groups, plan } = await seedApprovedPlan(db);
      expect(plan).toMatchObject({ variantsSafeToSplit: 8, predictedNewVariants: 15 });

      const genieValues = await db.sourceValue.findMany({
        where: { sourceRecordId: { in: groups[1]!.records.map((record) => record.id) }, field: "name.en" },
      });
      const oldConflict = await db.conflict.create({ data: {
        entityType: "ProductVariant", entityId: groups[1]!.variant.id, field: "name.en", status: "OPEN",
      } });
      await db.conflictValue.createMany({ data: genieValues.map((value) => ({ conflictId: oldConflict.id, sourceValueId: value.id })) });

      const preview = await repairMergedIdentities(db, plan, {
        expected: { variantsToSplit: 8, clustersToMaterialize: 23, newVariants: 15, currentVariantCount: 8 },
      });
      expect(preview).toMatchObject({
        dryRun: true, planValidated: true, variantsToSplit: 8, clustersToMaterialize: 23,
        newVariantsPlanned: 15, currentVariantCount: 8, predictedVariantCount: 23,
        conflictsExpectedToResolve: 1, reviewTasksExpectedToChange: 0, applyBlocked: false,
        productsToCreate: 15, productsToKeep: 8, productsToReuse: 0,
        productsToClone: 0, sharedProductsPreserved: 0, productCanonicalCollisions: [],
      });
      expect(await db.productVariant.count()).toBe(8);

      const applied = await repairMergedIdentities(db, plan, {
        apply: true,
        skipAdvisoryLock: true,
        expected: { planHash: repairPlanHash(plan), variantsToSplit: 8, clustersToMaterialize: 23, newVariants: 15, currentVariantCount: 8 },
      });
      expect(applied).toMatchObject({
        dryRun: false, variantsCreated: 15, sourceRecordsMoved: 15,
        conflictsResolved: 1, conflictsCreated: 0, canonicalRekeysApplied: 23,
        currentVariantCount: 8, predictedVariantCount: 23, resultingVariantCount: 23,
      });
      expect(await db.productVariant.count()).toBe(23);
      expect(await db.productReference.count({ where: { identityClass: "REUSED", identityReason: "validated-merged-variant-split" } })).toBe(23);
      expect((await db.conflict.findUniqueOrThrow({ where: { id: oldConflict.id } }))).toMatchObject({
        status: "AUTO_RESOLVED", resolutionNote: "resolved-by-merged-variant-split",
      });

      const records = await db.sourceRecord.findMany({
        include: {
          source: { select: { key: true } },
          variant: { include: { product: true, references: true, translations: true } },
          values: { where: { entityType: "ProductVariant" } },
        },
      });
      for (const record of records) {
        expect(record.variant).not.toBeNull();
        const reference = record.values.find((value) => value.field === "reference")!.normalizedValue as string;
        const parsedBase = reference.toUpperCase().replace(/-GER$/i, "").replace(/V\d+$/i, "");
        const expected = qualifiedIdentityKeys(parsedBase, reference.toUpperCase(), [{ sourceKey: record.source.key, externalId: record.externalId }]);
        expect(record.variant!.canonicalKey).toBe(expected.variantKey);
        expect(record.variant!.product.canonicalKey).toBe(expected.productKey);
        expect(record.values.every((value) => value.entityId === record.variantId)).toBe(true);
      }

      const genie = records.find((record) => record.externalId.endsWith("-genie"))!;
      const mermaid = records.find((record) => record.externalId.endsWith("-mermaid"))!;
      expect(genie.variantId).not.toBe(mermaid.variantId);
      expect(genie.variant!.translations.find((translation) => translation.locale === "en")?.name).toBe("Genie");
      expect(genie.variant!.translations.some((translation) => translation.name === "Mermaid")).toBe(false);
      expect(mermaid.variant!.translations.find((translation) => translation.locale === "fr")?.name).toBe("Sirène");

      for (const group of groups) {
        const expectedAnchor = [...group.records].sort((left, right) => left.externalId.localeCompare(right.externalId))[0]!;
        expect((await db.sourceRecord.findUniqueOrThrow({ where: { id: expectedAnchor.id } })).variantId).toBe(group.variant.id);
        const materialized = await db.sourceRecord.findMany({ where: { id: { in: group.records.map((record) => record.id) } }, select: { variantId: true } });
        expect(new Set(materialized.map((record) => record.variantId)).size).toBe(group.records.length);
      }

      const reclassification = await reclassifyIdentities(db, false);
      expect(reclassification.canonicalRekeysPlanned).toBe(0);
      expect(reclassification.ambiguousReferenceGroups).toBe(0);
      expect(reclassification.reusedReferenceGroups).toBe(8);
      const keysBeforeReclassification = (await db.productVariant.findMany({
        select: { id: true, canonicalKey: true }, orderBy: { id: "asc" },
      })).map((variant) => [variant.id, variant.canonicalKey]);
      const appliedReclassification = await reclassifyIdentities(db, true);
      expect(appliedReclassification.canonicalRekeysPlanned).toBe(0);
      expect((await db.productVariant.findMany({
        select: { id: true, canonicalKey: true }, orderBy: { id: "asc" },
      })).map((variant) => [variant.id, variant.canonicalKey])).toEqual(keysBeforeReclassification);

      const second = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(second).toMatchObject({ alreadyApplied: true, variantsCreated: 0, sourceRecordsMoved: 0, currentVariantCount: 23 });
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  }, 15_000);

  it.each([2, 4, 12])("preserves a Product shared by %i variants and detaches every repaired cluster", async (variantCount) => {
    const { db, database: embedded } = await database(`repair-shared-product-${variantCount}`);
    try {
      const source = await db.source.create({ data: {
        key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE",
      } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      const historicalProductKey = group.product.canonicalKey;
      for (let index = 1; index < variantCount; index += 1) await db.productVariant.create({ data: {
        productId: group.product.id,
        canonicalKey: `outside:${variantCount}:${index}:${fixtureSequence}`,
        name: `Outside variant ${index}`,
      } });
      const outsideVariantIds = (await db.productVariant.findMany({
        where: { productId: group.product.id, id: { not: group.variant.id } },
        select: { id: true },
      })).map((variant) => variant.id);
      const plan = await auditMergedIdentities(db);

      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({
        eligibleSplits: 1,
        blockedSplits: 0,
        productsToCreate: 2,
        productsToKeep: 0,
        productsToClone: 0,
        sharedProductsPreserved: 1,
        productCanonicalCollisions: [],
      });
      expect(preview.groups[0]?.productPlan).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "CREATE", reason: "preserve-shared-historical-product-and-create-qualified-product" }),
        expect.objectContaining({ action: "CREATE", reason: "preserve-shared-historical-product-and-create-qualified-product" }),
      ]));

      await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect((await db.product.findUniqueOrThrow({ where: { id: group.product.id } })).canonicalKey).toBe(historicalProductKey);
      expect(await db.productVariant.count({ where: { id: { in: outsideVariantIds }, productId: group.product.id } })).toBe(variantCount - 1);
      const repairedRecords = await db.sourceRecord.findMany({
        where: { id: { in: group.records.map((record) => record.id) } },
        select: { variant: { select: { productId: true, product: { select: { canonicalKey: true } } } } },
      });
      expect(repairedRecords.every((record) => record.variant?.productId !== group.product.id)).toBe(true);
      expect(new Set(repairedRecords.map((record) => record.variant?.productId)).size).toBe(2);
      expect(repairedRecords.every((record) => record.variant?.product.canonicalKey.includes(":record:"))).toBe(true);
      const second = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(second).toMatchObject({ alreadyApplied: true, variantsCreated: 0, productsCreated: 0 });
      expect(second.productsToReuse).toBe(2);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("blocks an existing Product canonical key collision during preflight without writing", async () => {
    const { db, database: embedded } = await database("repair-product-external-collision");
    try {
      const source = await db.source.create({ data: {
        key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE",
      } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      const records = [...group.records].sort((left, right) => left.externalId.localeCompare(right.externalId));
      const collisionKey = qualifiedIdentityKeys("30883802", "30883802-GER", [{
        sourceKey: "klickypedia", externalId: records[1]!.externalId,
      }]).productKey;
      const external = await db.product.create({ data: { canonicalKey: collisionKey, name: "Unrelated existing product" } });
      const plan = await auditMergedIdentities(db);
      const before = { products: await db.product.count(), variants: await db.productVariant.count() };

      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({
        eligibleSplits: 0,
        blockedSplits: 1,
        variantsToSplit: 0,
        productsToCreate: 0,
        productCanonicalCollisions: [expect.objectContaining({
          canonicalKey: collisionKey,
          existingProductId: external.id,
          reason: "EXISTING_PRODUCT_OUTSIDE_PLAN",
        })],
      });
      expect(preview.groups[0]?.applyEligibility).toBe("BLOCKED_PRODUCT_CANONICAL_COLLISION");
      const attempted = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(attempted).toMatchObject({ variantsCreated: 0, productsCreated: 0 });
      expect(await db.product.count()).toBe(before.products);
      expect(await db.productVariant.count()).toBe(before.variants);
      expect(await db.sourceRecord.count({ where: { variantId: group.variant.id } })).toBe(2);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("detects a Product key occupied by another repair group's historical Product", async () => {
    const { db, database: embedded } = await database("repair-product-cross-group-collision");
    try {
      const source = await db.source.create({ data: {
        key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE",
      } });
      const first = await seedGroup(db, source.id, approvedFixtures[1]!);
      const second = await seedGroup(db, source.id, approvedFixtures[6]!);
      const ordered = [...first.records].sort((left, right) => left.externalId.localeCompare(right.externalId));
      const occupiedKey = qualifiedIdentityKeys("30883802", "30883802-GER", [{
        sourceKey: "klickypedia", externalId: ordered[1]!.externalId,
      }]).productKey;
      await db.product.update({ where: { id: second.product.id }, data: { canonicalKey: occupiedKey } });

      const preview = await repairMergedIdentities(db, await auditMergedIdentities(db));
      expect(preview.productCanonicalCollisions).toContainEqual(expect.objectContaining({
        canonicalKey: occupiedKey,
        existingProductId: second.product.id,
        reason: "EXISTING_PRODUCT_OUTSIDE_PLAN",
      }));
      expect(preview).toMatchObject({ eligibleSplits: 1, blockedSplits: 1 });
      expect(preview.groups.find((group) => group.currentVariantId === first.variant.id)?.applyEligibility)
        .toBe("BLOCKED_PRODUCT_CANONICAL_COLLISION");
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("rolls back all earlier groups when an unexpected Product collision appears after transactional preflight", async () => {
    const { db, database: embedded } = await database("repair-product-late-collision");
    try {
      const source = await db.source.create({ data: {
        key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE",
      } });
      const first = await seedGroup(db, source.id, approvedFixtures[1]!);
      const second = await seedGroup(db, source.id, approvedFixtures[6]!);
      const plan = await auditMergedIdentities(db);
      const before = { products: await db.product.count(), variants: await db.productVariant.count() };
      let calls = 0;

      await expect(repairMergedIdentities(db, plan, {
        apply: true,
        skipAdvisoryLock: true,
        beforeProductMaterialization: async (context, tx) => {
          calls += 1;
          if (calls === 3) await tx.product.create({ data: { canonicalKey: context.canonicalKey, name: "Injected collision" } });
        },
      })).rejects.toThrow();
      expect(await db.product.count()).toBe(before.products);
      expect(await db.productVariant.count()).toBe(before.variants);
      expect(await db.sourceRecord.count({ where: { variantId: first.variant.id } })).toBe(2);
      expect(await db.sourceRecord.count({ where: { variantId: second.variant.id } })).toBe(2);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("never touches a REVIEW group included in the same audit plan", async () => {
    const { db, database: embedded } = await database("repair-review");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      await seedGroup(db, source.id, approvedFixtures[1]!);
      const reviewGroup = await seedGroup(db, source.id, {
        reference: "1234", format: "Set", records: [{ slug: "police-car", name: "Police car" }, { slug: "police-car-set", name: "Police car set" }],
      });
      const review = await db.reviewTask.create({ data: {
        kind: "ambiguous-reference", entityType: "ProductVariant", entityId: reviewGroup.variant.id, reason: "true-identity-conflict",
      } });
      const plan = await auditMergedIdentities(db);
      expect(plan.variantsSafeToSplit).toBe(1);
      await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect((await db.reviewTask.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("OPEN");
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: reviewGroup.variant.id } })).canonicalKey).toBe(reviewGroup.variant.canonicalKey);
      expect(await db.sourceRecord.count({ where: { variantId: reviewGroup.variant.id } })).toBe(2);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("aborts before writing when contentHash or SourceRecord ownership drifts", async () => {
    for (const mode of ["hash", "move"] as const) {
      const { db, database: embedded } = await database(`repair-drift-${mode}`);
      try {
        const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
        const group = await seedGroup(db, source.id, approvedFixtures[1]!);
        const plan = await auditMergedIdentities(db);
        if (mode === "hash") await db.sourceRecord.update({ where: { id: group.records[0]!.id }, data: { contentHash: "changed" } });
        else {
          const product = await db.product.create({ data: { canonicalKey: "unrelated-product" } });
          const variant = await db.productVariant.create({ data: { canonicalKey: "unrelated-variant", productId: product.id } });
          await db.sourceRecord.update({ where: { id: group.records[0]!.id }, data: { variantId: variant.id } });
        }
        await expect(repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true })).rejects.toThrow(/Drift detected/);
        expect(await db.productVariant.count()).toBe(mode === "hash" ? 1 : 2);
        expect(await db.productReference.count({ where: { identityClass: "REUSED" } })).toBe(0);
      } finally {
        await db.$disconnect();
        await embedded.close();
      }
    }
  });

  it("rolls back the whole transaction on a canonical collision", async () => {
    const { db, database: embedded } = await database("repair-collision");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      const second = group.records.slice().sort((left, right) => left.externalId.localeCompare(right.externalId))[1]!;
      const expected = qualifiedIdentityKeys("30883802", "30883802-GER", [{ sourceKey: "klickypedia", externalId: second.externalId }]);
      const blockerProduct = await db.product.create({ data: { canonicalKey: "collision-product" } });
      await db.productVariant.create({ data: { canonicalKey: expected.variantKey, productId: blockerProduct.id } });
      const plan = await auditMergedIdentities(db);
      const before = await db.productVariant.count();
      await expect(repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true })).rejects.toThrow(/Canonical variant key collision/);
      expect(await db.productVariant.count()).toBe(before);
      expect(await db.sourceRecord.count({ where: { variantId: group.variant.id } })).toBe(2);
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: group.variant.id } })).canonicalKey).toBe(group.variant.canonicalKey);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("rolls back the first seven groups when an error occurs in the eighth", async () => {
    const { db, database: embedded } = await database("repair-eighth-rollback");
    try {
      const { groups, plan } = await seedApprovedPlan(db);
      await expect(repairMergedIdentities(db, plan, {
        apply: true,
        skipAdvisoryLock: true,
        afterGroup: (completed) => { if (completed === 8) throw new Error("injected-eighth-group-failure"); },
      })).rejects.toThrow("injected-eighth-group-failure");
      expect(await db.productVariant.count()).toBe(8);
      expect(await db.product.count()).toBe(8);
      for (const group of groups) expect(await db.sourceRecord.count({ where: { variantId: group.variant.id } })).toBe(group.records.length);
      expect(await db.productReference.count({ where: { identityClass: "REUSED" } })).toBe(0);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("applies only eligible groups and leaves a blocked group byte-for-byte attached to its original variant", async () => {
    const { db, database: embedded } = await database("repair-partial-eligibility");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const blocked = await seedGroup(db, source.id, approvedFixtures[1]!);
      const eligible = await seedGroup(db, source.id, approvedFixtures[6]!);
      const media = await db.mediaAsset.create({ data: {
        variantId: blocked.variant.id, sourceId: source.id, kind: "main", sourceUrl: "https://images.example/unknown-owner.jpg",
      } });
      const plan = await auditMergedIdentities(db);
      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({
        identitySafeSplits: 2, eligibleSplits: 1, blockedSplits: 1, eligibleNewVariants: 1,
        currentVariantCount: 2, predictedVariantCountAfterApply: 3, applyBlocked: false,
      });
      expect(preview.relationAttributionBlockers).toEqual([expect.objectContaining({ relation: "MediaAsset", count: 1 })]);
      expect(preview.groups.find((group) => group.currentVariantId === blocked.variant.id)).toMatchObject({
        identityClassification: "DISTINCT", sourceConsistency: "CONSISTENT", safeAction: "SPLIT",
        relationAttribution: "INCOMPLETE", applyEligibility: "BLOCKED_UNATTRIBUTED_RELATIONS",
        unattributableRelations: { mediaAssets: 1, instructions: 0, variantFigures: 0, variantParts: 0 },
      });

      const applied = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(applied).toMatchObject({ variantsCreated: 1, resultingVariantCount: 3, eligibleSplits: 1, blockedSplits: 1 });
      expect(await db.productVariant.count()).toBe(3);
      expect(await db.sourceRecord.count({ where: { variantId: blocked.variant.id } })).toBe(2);
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: blocked.variant.id } })).canonicalKey).toBe(blocked.variant.canonicalKey);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).variantId).toBe(blocked.variant.id);
      expect(new Set((await db.sourceRecord.findMany({ where: { id: { in: eligible.records.map((record) => record.id) } } })).map((record) => record.variantId)).size).toBe(2);

      const second = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(second).toMatchObject({ eligibleSplits: 0, blockedSplits: 1, appliedSplits: 1, eligibleNewVariants: 0, variantsCreated: 0, resultingVariantCount: 3 });
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it.each([
    ["MediaAsset", async (db: PrismaClient, sourceId: string, variantId: string) => {
      await db.mediaAsset.create({ data: { variantId, sourceId, kind: "main", sourceUrl: "https://images.example/unattributed.jpg" } });
    }, "mediaAssets"],
    ["Instruction", async (db: PrismaClient, sourceId: string, variantId: string) => {
      await db.instruction.create({ data: { variantId, sourceId, documentUrl: "https://docs.example/unattributed.pdf" } });
    }, "instructions"],
    ["VariantFigure", async (db: PrismaClient, _sourceId: string, variantId: string) => {
      const figure = await db.figure.create({ data: { canonicalKey: `figure:${fixtureSequence}` } });
      await db.variantFigure.create({ data: { variantId, figureId: figure.id, quantity: 1 } });
    }, "variantFigures"],
    ["VariantPart", async (db: PrismaClient, _sourceId: string, variantId: string) => {
      const part = await db.part.create({ data: { partNumber: `part:${fixtureSequence}` } });
      await db.variantPart.create({ data: { variantId, partId: part.id, quantity: 1 } });
    }, "variantParts"],
  ] as const)("marks an unattributable %s as blocked and performs no mutation", async (relation, seedRelation, countField) => {
    const { db, database: embedded } = await database(`repair-block-${relation}`);
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      await seedRelation(db, source.id, group.variant.id);
      const plan = await auditMergedIdentities(db);

      const preview = await repairMergedIdentities(db, plan);
      const detail = preview.groups[0]!;
      expect(preview).toMatchObject({ identitySafeSplits: 1, eligibleSplits: 0, blockedSplits: 1, eligibleNewVariants: 0, predictedVariantCountAfterApply: 1, applyBlocked: true });
      expect(detail).toMatchObject({ relationAttribution: "INCOMPLETE", applyEligibility: "BLOCKED_UNATTRIBUTED_RELATIONS" });
      expect(detail.unattributableRelations[countField]).toBe(1);

      const applied = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(applied).toMatchObject({ variantsCreated: 0, sourceRecordsMoved: 0, resultingVariantCount: 1 });
      expect(await db.productVariant.count()).toBe(1);
      expect(await db.sourceRecord.count({ where: { variantId: group.variant.id } })).toBe(2);
      expect((await db.productVariant.findUniqueOrThrow({ where: { id: group.variant.id } })).canonicalKey).toBe(group.variant.canonicalKey);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("ignores the exact generic Klickypedia fallback and preserves it only on the historical variant during apply", async () => {
    const { db, database: embedded } = await database("repair-generic-media");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      const fallback = await db.mediaAsset.create({ data: {
        variantId: group.variant.id, sourceId: source.id, kind: "main", sourceUrl: KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL,
      } });
      const plan = await auditMergedIdentities(db);

      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({
        identitySafeSplits: 1, eligibleSplits: 1, blockedSplits: 0,
        eligibleNewVariants: 1, genericMediaIgnored: 1,
      });
      expect(preview.relationAttributionBlockers).toEqual([]);
      expect(preview.groups[0]).toMatchObject({
        relationAttribution: "COMPLETE", applyEligibility: "ELIGIBLE", genericMediaIgnored: 1,
        unattributableRelations: { mediaAssets: 0 },
      });

      await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(await db.mediaAsset.count({ where: { sourceUrl: KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL } })).toBe(1);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: fallback.id } })).variantId).toBe(group.variant.id);
      const variants = await db.sourceRecord.findMany({ where: { id: { in: group.records.map((record) => record.id) } }, select: { variantId: true } });
      expect(new Set(variants.map((record) => record.variantId)).size).toBe(2);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("ignores the exact fallback while a real unattributable media asset still blocks the group", async () => {
    const { db, database: embedded } = await database("repair-generic-and-real-media");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      await db.mediaAsset.createMany({ data: [
        { variantId: group.variant.id, sourceId: source.id, kind: "main", sourceUrl: KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL },
        { variantId: group.variant.id, sourceId: source.id, kind: "gallery", sourceUrl: "https://images.example/real-unattributed.jpg" },
      ] });
      const preview = await repairMergedIdentities(db, await auditMergedIdentities(db));

      expect(preview).toMatchObject({ eligibleSplits: 0, blockedSplits: 1, genericMediaIgnored: 1 });
      expect(preview.groups[0]).toMatchObject({
        genericMediaIgnored: 1,
        applyEligibility: "BLOCKED_UNATTRIBUTED_RELATIONS",
        unattributableRelations: { mediaAssets: 1 },
      });
      expect(preview.relationAttributionBlockers).toEqual([expect.objectContaining({ relation: "MediaAsset", count: 1 })]);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("does not treat a lookalike fallback URL as generic", async () => {
    const { db, database: embedded } = await database("repair-lookalike-media");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      await db.mediaAsset.create({ data: {
        variantId: group.variant.id, sourceId: source.id, kind: "main",
        sourceUrl: `${KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL}?variant=1`,
      } });
      const preview = await repairMergedIdentities(db, await auditMergedIdentities(db));

      expect(preview).toMatchObject({ eligibleSplits: 0, blockedSplits: 1, genericMediaIgnored: 0 });
      expect(preview.groups[0]).toMatchObject({ genericMediaIgnored: 0, unattributableRelations: { mediaAssets: 1 } });
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("attributes an observed media URL to one cluster even when two records in that cluster observed it", async () => {
    const { db, database: embedded } = await database("repair-observed-one-cluster");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, {
        reference: "30883802-GER", theme: "Waterworld", records: [
          { slug: "genie-a", name: "Genie", names: translated("Genie", "Flaschengeist", "Genio de la lámpara", "Génie de la lampe") },
          { slug: "genie-b", name: "Genie", names: translated("Genie", "Flaschengeist", "Genio de la lámpara", "Génie de la lampe") },
          { slug: "mermaid", name: "Mermaid", names: translated("Mermaid", "Meerjungfrau", "Sirena", "Sirène") },
        ],
      });
      const mediaUrl = "https://images.example/genie.jpg";
      const media = await db.mediaAsset.create({ data: { variantId: group.variant.id, sourceId: source.id, kind: "main", sourceUrl: mediaUrl } });
      await db.sourceMediaObservation.createMany({ data: group.records.slice(0, 2).map((record) => ({ sourceRecordId: record.id, sourceUrl: mediaUrl, kind: "main" })) });
      const plan = await auditMergedIdentities(db);
      expect(plan.details[0]?.proposedClusters.map((cluster) => cluster.recordIds.length).sort()).toEqual([1, 2]);

      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({ eligibleSplits: 1, blockedSplits: 0, mediaAssetsToMove: 1, mediaAssetsToDuplicate: 0 });
      const applied = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(applied.mediaAssetsDuplicated).toBe(0);
      const genieVariantIds = await db.sourceRecord.findMany({ where: { id: { in: group.records.slice(0, 2).map((record) => record.id) } }, select: { variantId: true } });
      expect(new Set(genieVariantIds.map((record) => record.variantId)).size).toBe(1);
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: media.id } })).variantId).toBe(genieVariantIds[0]!.variantId);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("duplicates a historical asset only when SourceMediaObservations prove the URL on both clusters", async () => {
    const { db, database: embedded } = await database("repair-observed-two-clusters");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      const mediaUrl = "https://images.example/shared-proven.jpg";
      await db.mediaAsset.create({ data: { variantId: group.variant.id, sourceId: source.id, kind: "gallery", sourceUrl: mediaUrl, copyrightOwner: "historic owner" } });
      await db.sourceMediaObservation.createMany({ data: group.records.map((record) => ({ sourceRecordId: record.id, sourceUrl: mediaUrl, kind: "gallery" })) });
      const plan = await auditMergedIdentities(db);

      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({ eligibleSplits: 1, blockedSplits: 0, mediaAssetsToMove: 1, mediaAssetsToDuplicate: 1 });
      const applied = await repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true });
      expect(applied.mediaAssetsDuplicated).toBe(1);
      const assets = await db.mediaAsset.findMany({ where: { sourceUrl: mediaUrl }, orderBy: { variantId: "asc" } });
      expect(assets).toHaveLength(2);
      expect(new Set(assets.map((asset) => asset.variantId)).size).toBe(2);
      expect(assets.every((asset) => asset.copyrightOwner === "historic owner")).toBe(true);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("never uses an observation belonging to a REVIEW group to authorize a SPLIT", async () => {
    const { db, database: embedded } = await database("repair-review-observation-isolation");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const split = await seedGroup(db, source.id, approvedFixtures[1]!);
      const review = await seedGroup(db, source.id, {
        reference: "1234", format: "Set", records: [{ slug: "police-car", name: "Police car" }, { slug: "police-car-set", name: "Police car set" }],
      });
      const mediaUrl = "https://images.example/review-only.jpg";
      await db.mediaAsset.create({ data: { variantId: split.variant.id, sourceId: source.id, kind: "main", sourceUrl: mediaUrl } });
      await db.sourceMediaObservation.create({ data: { sourceRecordId: review.records[0]!.id, sourceUrl: mediaUrl, kind: "main" } });
      const preview = await repairMergedIdentities(db, await auditMergedIdentities(db));
      expect(preview).toMatchObject({ identitySafeSplits: 1, eligibleSplits: 0, blockedSplits: 1 });
      expect(preview.groups[0]?.unattributableRelations.mediaAssets).toBe(1);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });
});
