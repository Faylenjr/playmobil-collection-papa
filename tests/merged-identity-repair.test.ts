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

  it("blocks unattributable legacy relations instead of copying them to every cluster", async () => {
    const { db, database: embedded } = await database("repair-relation-blocker");
    try {
      const source = await db.source.create({ data: { key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE" } });
      const group = await seedGroup(db, source.id, approvedFixtures[1]!);
      await db.mediaAsset.create({ data: {
        variantId: group.variant.id, sourceId: source.id, kind: "main", sourceUrl: "https://images.example/unknown-owner.jpg",
      } });
      const plan = await auditMergedIdentities(db);
      const preview = await repairMergedIdentities(db, plan);
      expect(preview).toMatchObject({ applyBlocked: true, variantsCreated: 0 });
      expect(preview.relationAttributionBlockers).toEqual([expect.objectContaining({ relation: "MediaAsset", count: 1 })]);
      await expect(repairMergedIdentities(db, plan, { apply: true, skipAdvisoryLock: true })).rejects.toThrow(/lack defensible SourceRecord attribution/);
      expect(await db.productVariant.count()).toBe(1);
      expect(await db.mediaAsset.count({ where: { variantId: group.variant.id } })).toBe(1);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });
});
