import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma-node/client";
import { getNodeDatabaseClient } from "../lib/db-node";
import { buildOfficialProductImportPlan, officialMarketConfig, type OfficialImportSnapshot } from "../lib/official-product-import";
import { identifierObservationKey } from "../lib/product-identifiers";

const snapshotFile = path.join(process.cwd(), "data", "audit", "playmobil-official-import-2026.json");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshot = JSON.parse(await readFile(snapshotFile, "utf8")) as OfficialImportSnapshot;
  const db = getNodeDatabaseClient();
  try {
    const existingProducts = await db.product.findMany({ where: { baseReference: { in: snapshot.observations.map((item) => item.reference) } }, select: { id: true, baseReference: true, canonicalKey: true } });
    const unsafeReferences = new Set(existingProducts.filter((item) => item.canonicalKey !== `official:playmobil:${item.baseReference}`).map((item) => item.baseReference!));
    const plan = buildOfficialProductImportPlan(snapshot, unsafeReferences);
    const ready = plan.filter((item) => item.status === "READY");
    const identifierValues = [...new Set(ready.flatMap((item) => item.identifiers.map((identifier) => identifier.normalizedValue)))];
    const tableRows = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass('public.product_identifiers') IS NOT NULL AS exists`;
    const identifierTableExists = tableRows[0]?.exists ?? false;
    const existingIdentifiers = identifierTableExists && identifierValues.length ? await db.productIdentifier.findMany({ where: { normalizedValue: { in: identifierValues }, confidence: { not: "REJECTED" } }, include: { variant: { select: { productId: true } } } }) : [];
    const identifierCollisions = ready.flatMap((item) => item.identifiers.flatMap((identifier) => existingIdentifiers
      .filter((existing) => existing.type === identifier.type && existing.normalizedValue === identifier.normalizedValue)
      .filter((existing) => (existing.productId ?? existing.variant?.productId) !== existingProducts.find((product) => product.baseReference === item.reference)?.id)
      .map((existing) => ({ reference: item.reference, type: identifier.type, value: identifier.normalizedValue, existingIdentifierId: existing.id }))));
    const summary = {
      mode: apply ? "APPLY" : "DRY_RUN",
      snapshotObservedAt: snapshot.observedAt,
      ready: ready.length,
      alreadyImported: existingProducts.filter((item) => item.canonicalKey === `official:playmobil:${item.baseReference}`).length,
      blocked: plan.filter((item) => item.status !== "READY").map((item) => ({ reference: item.reference, status: item.status })),
      identifierCollisions,
      migrationRequired: !identifierTableExists,
      wouldCreate: {
        products: ready.filter((item) => !existingProducts.some((product) => product.canonicalKey === `official:playmobil:${item.reference}`)).length,
        variants: ready.filter((item) => !existingProducts.some((product) => product.canonicalKey === `official:playmobil:${item.reference}`)).length,
      },
      wouldEnsure: {
        references: ready.length,
        translations: ready.reduce((sum, item) => sum + new Set(item.translations.map((translation) => translation.locale)).size, 0),
        identifierObservations: ready.reduce((sum, item) => sum + item.identifiers.length, 0),
        mediaObservations: ready.reduce((sum, item) => sum + item.media.length, 0),
        listPrices: ready.reduce((sum, item) => sum + item.listPrices.filter((price) => price.market !== "en-US").length, 0),
      },
      nullByDesign: { releaseYear: ready.filter((item) => item.releaseYear === null).length, theme: ready.length, pieceCount: ready.filter((item) => item.pieceCount === null).length, figureCount: ready.filter((item) => item.figureCount === null).length },
    };
    if (!apply || identifierCollisions.length) { console.log(JSON.stringify(summary, null, 2)); if (apply && identifierCollisions.length) process.exitCode = 2; return; }

    let createdProducts = 0;
    let createdIdentifiers = 0;
    let createdPrices = 0;
    await db.$transaction(async (tx) => {
      const sources = new Map<string, { id: string }>();
      const markets = new Map<string, { id: string }>();
      for (const [market, config] of Object.entries(officialMarketConfig)) {
        const source = await tx.source.upsert({ where: { key: config.sourceKey }, update: { name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: new Date(snapshot.observedAt) }, create: { key: config.sourceKey, name: config.sourceName, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: 5, enabled: true, robotsCheckedAt: new Date(snapshot.observedAt) } });
        const marketRow = await tx.market.findUniqueOrThrow({ where: { code: config.code } });
        sources.set(market, source); markets.set(market, marketRow);
      }
      for (const item of ready) {
        const canonicalKey = `official:playmobil:${item.reference}`;
        const existing = await tx.product.findUnique({ where: { canonicalKey } });
        const product = existing ?? await tx.product.create({ data: { canonicalKey, baseReference: item.reference, kind: "UNKNOWN", name: item.preferredName, releaseYear: item.releaseYear } });
        if (!existing) createdProducts += 1;
        const structuredFacts = {
          pieceCount: item.pieceCount,
          figureCount: item.figureCount,
          weightGrams: item.weightGrams === null ? null : new Prisma.Decimal(item.weightGrams),
          widthMm: item.packageDimensions === null ? null : new Prisma.Decimal(item.packageDimensions.width),
          depthMm: item.packageDimensions === null ? null : new Prisma.Decimal(item.packageDimensions.depth),
          heightMm: item.packageDimensions === null ? null : new Prisma.Decimal(item.packageDimensions.height),
        };
        const variant = await tx.productVariant.upsert({ where: { canonicalKey: `${canonicalKey}:commercial` }, update: { name: item.preferredName, ...structuredFacts }, create: { productId: product.id, canonicalKey: `${canonicalKey}:commercial`, variantKind: "UNKNOWN", name: item.preferredName, releaseYear: item.releaseYear, ...structuredFacts } });
        const preferredObservation = item.observations.find((observation) => observation.market === "fr-FR") ?? item.observations[0]!;
        const preferredSource = sources.get(preferredObservation.market)!;
        await tx.productReference.upsert({ where: { variantId_normalizedValue: { variantId: variant.id, normalizedValue: item.reference } }, update: { displayValue: item.reference, baseValue: item.reference, isPrimary: true, sourceId: preferredSource.id, identityClass: "ASSIGNED", identityReason: "Référence observée sur une page produit PLAYMOBIL officielle" }, create: { variantId: variant.id, displayValue: item.reference, normalizedValue: item.reference, baseValue: item.reference, isPrimary: true, sourceId: preferredSource.id, identityClass: "ASSIGNED", identityReason: "Référence observée sur une page produit PLAYMOBIL officielle" } });

        for (const observation of item.observations) {
          const config = officialMarketConfig[observation.market];
          const source = sources.get(observation.market)!;
          const market = markets.get(observation.market)!;
          await tx.variantMarket.upsert({ where: { variantId_marketId: { variantId: variant.id, marketId: market.id } }, create: { variantId: variant.id, marketId: market.id }, update: {} });
          if (observation.name) {
            await tx.translation.upsert({ where: { productId_locale: { productId: product.id, locale: config.locale } }, create: { productId: product.id, locale: config.locale, name: observation.name, description: observation.description ?? null }, update: { name: observation.name, ...(observation.description ? { description: observation.description } : {}) } });
            await tx.variantTranslation.upsert({ where: { variantId_locale: { variantId: variant.id, locale: config.locale } }, create: { variantId: variant.id, locale: config.locale, name: observation.name, description: observation.description ?? null }, update: { name: observation.name, ...(observation.description ? { description: observation.description } : {}) } });
          }
          const sourceRecord = await tx.sourceRecord.upsert({
            where: { sourceId_externalId: { sourceId: source.id, externalId: `${observation.market}:${item.reference}` } },
            create: { sourceId: source.id, variantId: variant.id, externalId: `${observation.market}:${item.reference}`, sourceUrl: observation.sourceUrl, recordType: "OFFICIAL_PRODUCT", rawPayload: observation as unknown as Prisma.InputJsonValue, contentHash: digest(observation), firstSeenAt: new Date(snapshot.observedAt), lastSeenAt: new Date(snapshot.observedAt), lastCheckedAt: new Date(snapshot.observedAt) },
            update: { variantId: variant.id, sourceUrl: observation.sourceUrl, rawPayload: observation as unknown as Prisma.InputJsonValue, contentHash: digest(observation), lastSeenAt: new Date(snapshot.observedAt), lastCheckedAt: new Date(snapshot.observedAt) },
          });
          for (const media of observation.officialImages ?? []) {
            await tx.mediaAsset.upsert({ where: { variantId_sourceUrl: { variantId: variant.id, sourceUrl: media.url } }, create: { variantId: variant.id, sourceId: source.id, kind: media.kind, sourceUrl: media.url, copyrightOwner: "PLAYMOBIL", canDisplay: true, canRehost: false, lastVerifiedAt: new Date(snapshot.observedAt) }, update: { sourceId: source.id, kind: media.kind, copyrightOwner: "PLAYMOBIL", canDisplay: true, canRehost: false, lastVerifiedAt: new Date(snapshot.observedAt) } });
          }
          for (const identifier of observation.officialIdentifiers ?? []) {
            const normalized = item.identifiers.find((candidate) => candidate.market === observation.market && candidate.type === identifier.type && candidate.rawValue === identifier.rawValue)?.normalizedValue;
            if (!normalized) continue;
            const observationKey = identifierObservationKey({ target: { productId: product.id }, type: identifier.type, normalizedValue: normalized, sourceId: source.id, marketId: market.id });
            const previous = await tx.productIdentifier.findUnique({ where: { observationKey } });
            await tx.productIdentifier.upsert({
              where: { observationKey },
              create: {
                observationKey,
                productId: product.id,
                type: identifier.type,
                rawValue: identifier.rawValue,
                normalizedValue: normalized,
                sourceId: source.id,
                sourceRecordId: sourceRecord.id,
                marketId: market.id,
                sourceUrl: observation.sourceUrl,
                observedAt: new Date(snapshot.observedAt),
                firstObservedAt: new Date(snapshot.observedAt),
                lastObservedAt: new Date(snapshot.observedAt),
                confidence: "OFFICIAL_CONFIRMED",
              },
              update: {
                rawValue: identifier.rawValue,
                sourceRecordId: sourceRecord.id,
                sourceUrl: observation.sourceUrl,
                observedAt: new Date(snapshot.observedAt),
                lastObservedAt: new Date(snapshot.observedAt),
                confidence: "OFFICIAL_CONFIRMED",
              },
            });
            if (!previous) createdIdentifiers += 1;
          }
          if (observation.officialPrice && observation.market !== "en-US") {
            const amount = new Prisma.Decimal(observation.officialPrice.amount.toFixed(2));
            const previous = await tx.listPriceObservation.findFirst({ where: { variantId: variant.id, marketId: market.id, sourceId: source.id, sourceUrl: observation.sourceUrl, amount, currency: observation.officialPrice.currency, observedAt: new Date(snapshot.observedAt) } });
            if (!previous) { await tx.listPriceObservation.create({ data: { variantId: variant.id, marketId: market.id, sourceId: source.id, amount, currency: observation.officialPrice.currency, sourceUrl: observation.sourceUrl, observedAt: new Date(snapshot.observedAt) } }); createdPrices += 1; }
          }
        }
        await tx.externalCandidate.updateMany({ where: { normalizedReference: item.reference }, data: { status: "IMPORTED", importedProductId: product.id, conflictReason: null, lastObservedAt: new Date(snapshot.observedAt) } });
      }
    }, { timeout: 180_000 });
    console.log(JSON.stringify({ ...summary, createdProducts, createdIdentifiers, createdPrices }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
