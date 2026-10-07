import type { PrismaClient } from "../generated/prisma-node/client";
import { buildPriceObservation } from "./offer-observations";
import { safeExternalOfferUrl } from "./pricing";

export type NormalizedCommerceOffer = {
  variantId: string;
  retailerKey: string;
  retailerName: string;
  retailerBaseUrl: string;
  retailerType: "SHOP" | "MARKETPLACE" | "PRIVATE_LISTING" | "MANUFACTURER";
  countryCode: string | null;
  marketCode: string;
  externalId: string;
  url: string;
  condition: "NEW" | "USED" | "SEALED" | "UNKNOWN";
  availability: "AVAILABLE" | "OUT_OF_STOCK" | "ENDED" | "UNKNOWN";
  matchConfidence: number;
  matchEvidence: string;
  itemPrice: number;
  shippingPrice: number | null;
  currency: string;
  observedAt: Date;
};

export type CommerceProvider = {
  sourceKey: string;
  sourceName: string;
  sourceBaseUrl: string;
  sourceTermsUrl: string;
};

export async function persistOfferRefresh(
  db: PrismaClient,
  provider: CommerceProvider,
  targetVariantIds: readonly string[],
  offers: readonly NormalizedCommerceOffer[],
) {
  for (const offer of offers) {
    if (!targetVariantIds.includes(offer.variantId)) throw new Error(`Offer target ${offer.variantId} is outside the refresh scope`);
    if (!safeExternalOfferUrl(offer.url)) throw new Error(`Unsafe offer URL for ${offer.externalId}`);
    if (offer.matchConfidence < 0.95) throw new Error(`Insufficient match confidence for ${offer.externalId}`);
  }

  return db.$transaction(async (tx) => {
    const source = await tx.source.upsert({
      where: { key: provider.sourceKey },
      update: { name: provider.sourceName, baseUrl: provider.sourceBaseUrl, termsUrl: provider.sourceTermsUrl, enabled: true },
      create: { key: provider.sourceKey, name: provider.sourceName, baseUrl: provider.sourceBaseUrl, termsUrl: provider.sourceTermsUrl, kind: "RETAILER", priority: 70, enabled: true },
    });
    const seen = new Set<string>();
    let createdRetailers = 0;
    let createdOffers = 0;
    let createdObservations = 0;

    for (const item of offers) {
      const market = await tx.market.findUnique({ where: { code: item.marketCode }, select: { id: true } });
      if (!market) throw new Error(`Unknown market ${item.marketCode}`);
      const existingRetailer = await tx.retailer.findUnique({ where: { slug: item.retailerKey }, select: { id: true } });
      const retailer = await tx.retailer.upsert({
        where: { slug: item.retailerKey },
        update: { name: item.retailerName, type: item.retailerType, countryCode: item.countryCode, baseUrl: item.retailerBaseUrl, sourceId: source.id, marketId: market.id },
        create: { slug: item.retailerKey, name: item.retailerName, type: item.retailerType, countryCode: item.countryCode, baseUrl: item.retailerBaseUrl, sourceId: source.id, marketId: market.id },
      });
      if (!existingRetailer) createdRetailers += 1;
      const existingOffer = await tx.offer.findUnique({ where: { retailerId_externalId: { retailerId: retailer.id, externalId: item.externalId } }, select: { id: true } });
      const offer = await tx.offer.upsert({
        where: { retailerId_externalId: { retailerId: retailer.id, externalId: item.externalId } },
        update: { variantId: item.variantId, productId: null, url: item.url, condition: item.condition, availability: item.availability, matchConfidence: item.matchConfidence, matchEvidence: item.matchEvidence, lastObservedAt: item.observedAt, expiresAt: null },
        create: { retailerId: retailer.id, variantId: item.variantId, externalId: item.externalId, url: item.url, condition: item.condition, availability: item.availability, matchConfidence: item.matchConfidence, matchEvidence: item.matchEvidence, firstObservedAt: item.observedAt, lastObservedAt: item.observedAt },
      });
      if (!existingOffer) createdOffers += 1;
      seen.add(`${retailer.id}:${item.externalId}`);
      const observation = buildPriceObservation(item);
      const existingObservation = await tx.priceObservation.findFirst({ where: { offerId: offer.id, observedAt: observation.observedAt } });
      if (!existingObservation) {
        await tx.priceObservation.create({ data: { offerId: offer.id, ...observation } });
        createdObservations += 1;
      }
    }

    const priorOffers = targetVariantIds.length ? await tx.offer.findMany({
      where: { variantId: { in: [...targetVariantIds] }, retailer: { sourceId: source.id } },
      select: { id: true, externalId: true, retailerId: true },
    }) : [];
    const expiredIds = priorOffers.filter((offer) => !seen.has(`${offer.retailerId}:${offer.externalId}`)).map((offer) => offer.id);
    if (expiredIds.length) await tx.offer.updateMany({ where: { id: { in: expiredIds } }, data: { availability: "ENDED", expiresAt: new Date() } });

    return { createdRetailers, createdOffers, createdObservations, expiredOffers: expiredIds.length };
  });
}
