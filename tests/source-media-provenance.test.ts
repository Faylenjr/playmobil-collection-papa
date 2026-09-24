import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import { KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL } from "../src/domain/source-media.js";
import { auditMergedIdentities } from "../src/jobs/audit-merged-identities.js";
import { enrichSourceMediaProvenance, type SourceMediaFetcher } from "../src/jobs/enrich-source-media-provenance.js";
import { repairMergedIdentities } from "../src/jobs/repair-merged-identities.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function database(name: string) {
  const directory = await mkdtemp(join(tmpdir(), `playmobil-${name}-`));
  directories.push(directory);
  return createEmbeddedDatabaseClient(directory);
}

async function seedBlockedGroup(db: PrismaClient) {
  const source = await db.source.create({ data: {
    key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE", priority: 30,
  } });
  const product = await db.product.create({ data: { canonicalKey: "legacy-product:30883802", baseReference: "30883802", kind: "FIGURE" } });
  const variant = await db.productVariant.create({ data: { productId: product.id, canonicalKey: "legacy-variant:30883802", name: "contaminated", releaseYear: 2005, format: "Blister" } });
  await db.productReference.create({ data: { variantId: variant.id, sourceId: source.id, displayValue: "30883802-GER", normalizedValue: "30883802-GER", baseValue: "30883802", isPrimary: true } });
  const definitions = [
    { slug: "genie", names: { en: "Genie", de: "Flaschengeist", es: "Genio de la lámpara", fr: "Génie de la lampe" } },
    { slug: "mermaid", names: { en: "Mermaid", de: "Meerjungfrau", es: "Sirena", fr: "Sirène" } },
  ];
  const records = [];
  for (const definition of definitions) {
    const sourceUrl = `https://www.klickypedia.com/sets/30883802-ger-${definition.slug}/`;
    const record = await db.sourceRecord.create({ data: {
      sourceId: source.id, variantId: variant.id, externalId: `sets/30883802-ger-${definition.slug}`,
      sourceUrl, recordType: "collectible", contentHash: `historic-${definition.slug}`,
    } });
    await db.sourceValue.createMany({ data: [
      { sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field: "reference", rawValue: "30883802-GER", normalizedValue: "30883802-GER", priority: 30 },
      ...Object.entries(definition.names).map(([locale, name]) => ({ sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field: `name.${locale}`, rawValue: name, normalizedValue: name, priority: 30 })),
      { sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field: "releaseYear", rawValue: 2005, normalizedValue: 2005, priority: 30 },
      { sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field: "theme", rawValue: "Waterworld", normalizedValue: "Waterworld", priority: 30 },
      { sourceId: source.id, sourceRecordId: record.id, entityType: "ProductVariant", entityId: variant.id, field: "format", rawValue: "Blister", normalizedValue: "Blister", priority: 30 },
    ] });
    records.push(record);
  }
  return { source, product, variant, records };
}

const mediaHtml = (...urls: string[]) => `<html><head></head><body><article class="type-sets">
  ${urls.map((url, index) => index === 0
    ? `<a href="${url}"><img class="set_image"></a>`
    : `<a rel="lightbox[set]" href="${url}"><img alt="gallery"></a>`).join("\n")}
</article></body></html>`;

class FixtureFetcher implements SourceMediaFetcher {
  calls: string[] = [];
  constructor(private readonly responses: Map<string, { status: number; body: string }>) {}
  async get(url: string) {
    this.calls.push(url);
    const response = this.responses.get(url) ?? { status: 404, body: "" };
    return { ...response, hash: createHash("sha256").update(response.body).digest("hex") };
  }
}

describe("targeted source media provenance enrichment", () => {
  it("keeps dry-run read-only, writes only observations on apply, reports new media, and is idempotent", async () => {
    const { db, database: embedded } = await database("media-enrichment");
    try {
      const seeded = await seedBlockedGroup(db);
      const genieUrl = "https://images.example/genie.jpg";
      const mermaidUrl = "https://images.example/mermaid.jpg";
      const newUrl = "https://images.example/current-extra.jpg";
      await db.mediaAsset.createMany({ data: [
        { variantId: seeded.variant.id, sourceId: seeded.source.id, kind: "main", sourceUrl: genieUrl },
        { variantId: seeded.variant.id, sourceId: seeded.source.id, kind: "gallery", sourceUrl: mermaidUrl },
      ] });
      const plan = await auditMergedIdentities(db);
      const responses = new Map([
        [seeded.records[0]!.sourceUrl, { status: 200, body: mediaHtml(genieUrl, newUrl, KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL) }],
        [seeded.records[1]!.sourceUrl, { status: 200, body: mediaHtml(mermaidUrl) }],
      ]);

      const dryRun = await enrichSourceMediaProvenance(db, plan, { client: new FixtureFetcher(responses) });
      expect(dryRun).toMatchObject({
        dryRun: true, sourceRecordsTargeted: 2, pagesFetched: 2, pagesFailed: 0,
        observationsFound: 3, observationsCreated: 0, existingBlockedMedia: 2,
        mediaMatchedToAtLeastOneSourceRecord: 2, mediaStillUnattributable: 0,
        newMediaObserved: 1, groupsPotentiallyUnblocked: 1,
      });
      expect(await db.sourceMediaObservation.count()).toBe(0);
      expect(await db.productVariant.count()).toBe(1);
      expect(await db.mediaAsset.count()).toBe(2);

      const contentHashes = seeded.records.map((record) => record.contentHash);
      const applied = await enrichSourceMediaProvenance(db, plan, { apply: true, client: new FixtureFetcher(responses) });
      expect(applied).toMatchObject({ dryRun: false, observationsFound: 3, observationsCreated: 3 });
      expect(await db.sourceMediaObservation.count()).toBe(3);
      expect(await db.productVariant.count()).toBe(1);
      expect(await db.mediaAsset.count()).toBe(2);
      expect((await db.sourceRecord.findMany({ where: { id: { in: seeded.records.map((record) => record.id) } }, orderBy: { sourceUrl: "asc" } })).map((record) => record.contentHash).sort()).toEqual([...contentHashes].sort());

      const repairPreview = await repairMergedIdentities(db, plan);
      expect(repairPreview).toMatchObject({ eligibleSplits: 1, blockedSplits: 0, mediaAssetsToDuplicate: 0 });
      const noNetwork = new FixtureFetcher(new Map());
      const second = await enrichSourceMediaProvenance(db, plan, { apply: true, client: noNetwork });
      expect(second).toMatchObject({ sourceRecordsTargeted: 0, observationsCreated: 0 });
      expect(noNetwork.calls).toEqual([]);
      expect(await db.sourceMediaObservation.count()).toBe(3);
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });

  it("does not invent provenance when every targeted fetch fails", async () => {
    const { db, database: embedded } = await database("media-enrichment-failed");
    try {
      const seeded = await seedBlockedGroup(db);
      const mediaUrl = "https://images.example/unattributed.jpg";
      await db.mediaAsset.create({ data: { variantId: seeded.variant.id, sourceId: seeded.source.id, kind: "main", sourceUrl: mediaUrl } });
      const plan = await auditMergedIdentities(db);
      const responses = new Map(seeded.records.map((record) => [record.sourceUrl, { status: 503, body: "unavailable" }]));
      const report = await enrichSourceMediaProvenance(db, plan, { apply: true, client: new FixtureFetcher(responses) });

      expect(report).toMatchObject({ sourceRecordsTargeted: 2, pagesFetched: 0, pagesFailed: 2, observationsFound: 0, observationsCreated: 0, mediaStillUnattributable: 1, groupsPotentiallyUnblocked: 0 });
      expect(await db.sourceMediaObservation.count()).toBe(0);
      expect((await repairMergedIdentities(db, plan))).toMatchObject({ eligibleSplits: 0, blockedSplits: 1 });
    } finally {
      await db.$disconnect();
      await embedded.close();
    }
  });
});
