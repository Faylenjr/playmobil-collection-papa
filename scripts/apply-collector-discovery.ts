import { createDatabaseClient } from "../src/db/client";
import { official2026ManifestDigest, official2026ReleaseWaves, type OfficialRangeClaim } from "../lib/official-release-waves";
import { classifyMarketRelation, isXxlCollectorCandidate } from "../lib/collector-taxonomy";

const db = createDatabaseClient();
const observedAt = new Date("2026-09-25T00:00:00.000Z");
const documentHashes: Record<string, string> = {
  "january-february-2026": "091e7bfa37db45cd20c10080290d141f4345e4264054289f6f17f8f08aa9fe779",
  "march-2026": "5bc1a22b7589fb319fb379fd58dbd601ff74098d3de499a99f0b66f0fdde00dba",
  "soccer-2026": "ada3e811de3a96c871194bc82c8a5d6c479e5a170e2930ff4f46cf67688344fa0",
  "knights-2026": "6eba48bea515b91687430556f384d18fa2d7af344c1b70abcbdba3f3f44810c5a",
  "may-2026": "9335dfc0fbd1a5720b683a7abeb51ab7cdbbe42e8cd7505dc02e3592b5570b2a6",
};
const productLevelReferences = new Set<string>(["72027", "72028"]);

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

try {
  const references = [...new Set(official2026ReleaseWaves.flatMap((wave) => [...wave.references]))];
  const products = await db.product.findMany({ where: { baseReference: { in: references } }, select: { id: true, baseReference: true } });
  const productByReference = new Map<string, string>();
  for (const reference of references) {
    const matches = products.filter((product) => product.baseReference === reference);
    if (matches.length !== 1) throw new Error(`Unsafe official match for ${reference}: ${matches.length} products`);
    productByReference.set(reference, matches[0]!.id);
  }

  const [xxlCandidates, marketLinks] = await Promise.all([
    db.productVariant.findMany({
      where: { format: "Decoration toy" },
      select: { id: true, name: true, product: { select: { name: true } }, sourceRecords: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { sourceId: true, sourceUrl: true } } },
    }),
    db.variantMarket.findMany({
      select: {
        variantId: true, marketId: true,
        variant: { select: { variantKind: true, isExclusive: true, sourceRecords: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { sourceId: true, sourceUrl: true, rawPayload: true } } } },
        market: { select: { code: true } },
      },
    }),
  ]);
  const xxl = xxlCandidates.filter((candidate) => isXxlCollectorCandidate({ format: "Decoration toy", variantName: candidate.name, productName: candidate.product.name }));

  const result = await db.$transaction(async (tx) => {
    const source = await tx.source.upsert({
      where: { key: "playmobil-official-us" },
      create: { key: "playmobil-official-us", name: "PLAYMOBIL USA officiel", baseUrl: "https://www.playmobil.com/en-us/", kind: "OFFICIAL", priority: 10, enabled: true },
      update: { name: "PLAYMOBIL USA officiel", baseUrl: "https://www.playmobil.com/en-us/", kind: "OFFICIAL", priority: 10, enabled: true },
    });
    const usMarket = await tx.market.upsert({ where: { code: "USA-PLAYMOBIL" }, create: { code: "USA-PLAYMOBIL", name: "usa-playmobil" }, update: {} });

    const rangeIds = new Map<string, string>();
    for (const wave of official2026ReleaseWaves) {
      for (const claim of wave.rangeClaims) {
        const slug = slugify(claim.name);
        const range = await tx.productRange.upsert({
          where: { slug },
          create: { slug, canonicalName: claim.name, kind: claim.kind, startYear: 2026, marketId: usMarket.id, sourceId: source.id, sourceUrl: wave.sourceUrl, observedAt },
          update: { canonicalName: claim.name, kind: claim.kind, marketId: usMarket.id, sourceId: source.id, sourceUrl: wave.sourceUrl, observedAt },
        });
        rangeIds.set(claim.name, range.id);
        for (const reference of claim.references) {
          await tx.rangeMembership.upsert({
            where: { rangeId_productId: { rangeId: range.id, productId: productByReference.get(reference)! } },
            create: { rangeId: range.id, productId: productByReference.get(reference)!, observedReference: reference, sourceUrl: wave.sourceUrl, confidence: claim.confidence === "HIGH" ? 1 : 0.8, observedAt },
            update: { observedReference: reference, sourceUrl: wave.sourceUrl, confidence: claim.confidence === "HIGH" ? 1 : 0.8, observedAt },
          });
        }
      }
    }

    for (const wave of official2026ReleaseWaves) {
      const releaseWave = await tx.releaseWave.upsert({
        where: { slug: wave.slug },
        create: { slug: wave.slug, name: wave.label, releaseYear: 2026, periodStart: new Date(`${wave.period.start}T00:00:00Z`), periodEnd: new Date(`${wave.period.end}T00:00:00Z`), precision: wave.period.precision, marketId: usMarket.id, sourceId: source.id, sourceUrl: wave.sourceUrl, documentHash: documentHashes[wave.slug] ?? null, observedAt },
        update: { name: wave.label, releaseYear: 2026, periodStart: new Date(`${wave.period.start}T00:00:00Z`), periodEnd: new Date(`${wave.period.end}T00:00:00Z`), precision: wave.period.precision, marketId: usMarket.id, sourceId: source.id, sourceUrl: wave.sourceUrl, documentHash: documentHashes[wave.slug] ?? null, observedAt },
      });
      const observedOrder: readonly string[] = wave.observedOrder;
      for (const [manifestIndex, reference] of wave.references.entries()) {
        const productId = productByReference.get(reference)!;
        await tx.releaseWaveItem.upsert({
          where: { releaseWaveId_productId: { releaseWaveId: releaseWave.id, productId } },
          create: { releaseWaveId: releaseWave.id, productId, observedReference: reference, officialOrder: observedOrder.indexOf(reference) + 1, manifestOrder: manifestIndex + 1, matchStatus: productLevelReferences.has(reference) ? "MATCH_PRODUCT_UNIQUE" : "MATCH_UNIQUE", observedAt },
          update: { observedReference: reference, officialOrder: observedOrder.indexOf(reference) + 1, manifestOrder: manifestIndex + 1, matchStatus: productLevelReferences.has(reference) ? "MATCH_PRODUCT_UNIQUE" : "MATCH_UNIQUE", observedAt },
        });
      }
    }

    const category = await tx.collectorCategory.upsert({
      where: { slug: "geants-xxl" },
      create: { slug: "geants-xxl", name: "Géants / XXL", description: "Grandes figurines décoratives PLAYMOBIL identifiées par le format structuré Decoration toy et l'appellation XXL.", ruleVersion: "xxl-decoration-v1" },
      update: { name: "Géants / XXL", description: "Grandes figurines décoratives PLAYMOBIL identifiées par le format structuré Decoration toy et l'appellation XXL.", ruleVersion: "xxl-decoration-v1" },
    });
    for (const candidate of xxl) {
      const record = candidate.sourceRecords[0];
      await tx.variantCategoryMembership.upsert({
        where: { categoryId_variantId: { categoryId: category.id, variantId: candidate.id } },
        create: { categoryId: category.id, variantId: candidate.id, sourceId: record?.sourceId ?? null, sourceUrl: record?.sourceUrl ?? null, evidence: "format=Decoration toy; appellation structurée XXL", observedAt },
        update: { sourceId: record?.sourceId ?? null, sourceUrl: record?.sourceUrl ?? null, evidence: "format=Decoration toy; appellation structurée XXL", observedAt },
      });
    }

    for (const link of marketLinks) {
      const record = link.variant.sourceRecords[0];
      const relation = classifyMarketRelation({ variantKind: link.variant.variantKind, rawPayload: record?.rawPayload });
      const { kind } = relation;
      const evidence = relation.kind === "PRESENCE" ? `Présence documentée pour ${link.market.code}` : relation.evidence;
      await tx.marketEvidence.upsert({
        where: { variantId_marketId_kind: { variantId: link.variantId, marketId: link.marketId, kind } },
        create: { variantId: link.variantId, marketId: link.marketId, kind, sourceId: record?.sourceId ?? null, sourceUrl: record?.sourceUrl ?? null, evidence, confidence: relation.confidence, observedAt },
        update: { sourceId: record?.sourceId ?? null, sourceUrl: record?.sourceUrl ?? null, evidence, confidence: relation.confidence, observedAt },
      });
    }

    await tx.retailer.upsert({ where: { slug: "ebay" }, create: { slug: "ebay", name: "eBay", type: "MARKETPLACE", baseUrl: "https://www.ebay.fr/" }, update: { name: "eBay", type: "MARKETPLACE", baseUrl: "https://www.ebay.fr/" } });
    const rangeClaims: OfficialRangeClaim[] = official2026ReleaseWaves.flatMap((wave) => [...wave.rangeClaims]);
    return { source: source.key, waves: official2026ReleaseWaves.length, ranges: rangeIds.size, waveItems: references.length, rangeMemberships: rangeClaims.reduce((sum, range) => sum + range.references.length, 0), xxl: xxl.length, marketEvidence: marketLinks.length };
  }, { timeout: 120_000 });

  console.log(JSON.stringify({ manifestDigest: official2026ManifestDigest(), ...result }, null, 2));
} finally {
  await db.$disconnect();
}
