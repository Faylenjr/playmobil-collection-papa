import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { calculatePromotion, deliveryEstimateLabel, exactReferenceInTitle, isOfferFresh, latestOfficialPrice, matchEbayItem, normalizeEbayCondition, priceDrop, priceHistoryStats, relativeRefreshLabel, safeExternalOfferUrl } from "../lib/pricing";
import { EbayApiClient, ebayAdapterConfiguration, findEbayOfferCandidates } from "../lib/ebay-adapter";
import { persistOfferRefresh } from "../lib/offer-refresh";
import { createEmbeddedDatabaseClient } from "../src/db/embedded";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("prices and offers", () => {
  it("matches an isolated exact reference and rejects partial numbers", () => {
    expect(exactReferenceInTitle("PLAYMOBIL 70201 Station-service neuve", "70201")).toBe(true);
    expect(exactReferenceInTitle("Lot 170201 accessoires", "70201")).toBe(false);
    expect(matchEbayItem({ itemId: "x", title: "Playmobil 70201 complet", itemWebUrl: "https://www.ebay.fr/itm/x" }, "70201").accepted).toBe(true);
    expect(matchEbayItem({ itemId: "y", title: "Compatible 70201", itemWebUrl: "https://www.ebay.fr/itm/y" }, "70201").accepted).toBe(false);
    expect(matchEbayItem({ itemId: "z", title: "Lot sans référence", itemWebUrl: "https://www.ebay.fr/itm/z", gtin: "4008789722164" }, "70201", ["4008789722164"]).accepted).toBe(true);
    expect(matchEbayItem({ itemId: "bad-gtin", title: "PLAYMOBIL 70201", itemWebUrl: "https://www.ebay.fr/itm/bad", gtin: "4008789722201" }, "70201", ["4008789722164"]).accepted).toBe(false);
  });

  it("allows only known HTTPS marketplace links", () => {
    expect(safeExternalOfferUrl("https://www.ebay.fr/itm/123")).toContain("ebay.fr");
    expect(safeExternalOfferUrl("https://www.koupobol.com/sets/72216")).toContain("koupobol.com");
    expect(safeExternalOfferUrl("http://www.ebay.fr/itm/123")).toBeNull();
    expect(safeExternalOfferUrl("https://evil.example/redirect")).toBeNull();
  });

  it("keeps ambiguous eBay search responses out of automatic matching", async () => {
    const candidates = await findEbayOfferCandidates({ search: async () => [
      { itemId: "exact", title: "PLAYMOBIL 70201 complet", itemWebUrl: "https://www.ebay.fr/itm/exact" },
      { itemId: "partial", title: "Lot accessoires 170201", itemWebUrl: "https://www.ebay.fr/itm/partial" },
    ] }, "70201");
    expect(candidates.map(({ accepted }) => accepted)).toEqual([true, false]);
    expect(ebayAdapterConfiguration({ NODE_ENV: "test", EBAY_ENVIRONMENT: "sandbox" })).toMatchObject({ enabled: false, environment: "sandbox" });
    expect(ebayAdapterConfiguration({ NODE_ENV: "test", EBAY_CLIENT_ID: "id", EBAY_CLIENT_SECRET: "secret" })).toMatchObject({ enabled: true, deliveryCountry: "FR", deliveryPostalCode: null });
  });

  it("uses OAuth client credentials and the requested eBay marketplace", async () => {
    const calls: Array<{ url: string; authorization: string; marketplace: string; context: string }> = [];
    const request = async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), authorization: headers.get("authorization") ?? "", marketplace: headers.get("x-ebay-c-marketplace-id") ?? "", context: headers.get("x-ebay-c-enduserctx") ?? "" });
      if (String(input).includes("oauth2/token")) return new Response(JSON.stringify({ access_token: "access", expires_in: 7200 }), { status: 200 });
      return new Response(JSON.stringify({ itemSummaries: [{ itemId: "v1|1|0", title: "PLAYMOBIL 70201 neuf", itemWebUrl: "https://www.ebay.fr/itm/1", condition: "Neuf", conditionId: "1000", price: { value: "29.99", currency: "EUR" }, shippingOptions: [{ shippingCost: { value: "4.90", currency: "EUR" } }] }] }), { status: 200 });
    };
    const items = await new EbayApiClient("id", "secret", "production", request as typeof fetch, "FR", "75001").search("PLAYMOBIL 70201", "EBAY_FR");
    expect(calls[0]?.authorization).toMatch(/^Basic /);
    expect(calls[1]).toMatchObject({ authorization: "Bearer access", marketplace: "EBAY_FR", context: "contextualLocation=country%3DFR%2Czip%3D75001" });
    expect(calls[1]?.url).toContain("deliveryCountry%3AFR%2CdeliveryPostalCode%3A75001");
    expect(items[0]).toMatchObject({ condition: "Neuf", conditionId: "1000", price: { value: "29.99", currency: "EUR" }, shippingPrice: "4.90" });
  });

  it("calculates a fresh comparable new promotion but never labels used goods as a promotion", () => {
    const common = { currentPrice: 30, currentCurrency: "EUR", currentMarket: "FR", listPrice: 40, listCurrency: "EUR", listMarket: "FR", observedAt: new Date("2026-10-04T10:00:00Z"), now: new Date("2026-10-04T20:00:00Z") };
    expect(calculatePromotion({ ...common, condition: "NEW" })).toBe(0.25);
    expect(calculatePromotion({ ...common, condition: "USED" })).toBeNull();
    expect(calculatePromotion({ ...common, condition: "UNKNOWN" })).toBeNull();
    expect(calculatePromotion({ ...common, condition: "NEW", currentCurrency: "USD" })).toBeNull();
    expect(calculatePromotion({ ...common, condition: "NEW", now: new Date("2026-10-07T20:01:00Z") })).toBeNull();
  });

  it("expires old offers and never invents a sealed condition from free text", () => {
    expect(isOfferFresh(new Date("2026-10-04T10:00:00Z"), new Date("2026-10-05T09:59:00Z"))).toBe(true);
    expect(isOfferFresh(new Date("2026-10-04T10:00:00Z"), new Date("2026-10-05T10:01:00Z"))).toBe(false);
    expect(normalizeEbayCondition("New")).toBe("NEW");
    expect(normalizeEbayCondition("Used")).toBe("USED");
    expect(normalizeEbayCondition("Neuf")).toBe("NEW");
    expect(normalizeEbayCondition("Occasion")).toBe("USED");
    expect(normalizeEbayCondition("Unbekannt", "1000")).toBe("NEW");
    expect(normalizeEbayCondition("Unbekannt", "3000")).toBe("USED");
    expect(normalizeEbayCondition("Neuf avec défauts", "1750")).toBe("UNKNOWN");
    expect(normalizeEbayCondition("Boîte scellée jamais ouverte")).toBe("UNKNOWN");
  });

  it("keeps delivery useful without exposing a full French postal code", () => {
    expect(deliveryEstimateLabel("FR")).toBe("Livraison estimée pour la France");
    expect(deliveryEstimateLabel("FR", "77300")).toBe("Livraison estimée pour 77xxx");
    expect(relativeRefreshLabel(new Date("2026-10-07T10:00:00Z"), new Date("2026-10-07T12:15:00Z"))).toBe("Actualisé il y a 2 h");
  });

  it("distinguishes a current official price from the last known price of a retired item", () => {
    const current = { amount: 39.99, currency: "EUR", observedAt: new Date("2026-10-01"), validUntil: null };
    const retired = { amount: 29.99, currency: "EUR", observedAt: new Date("2026-10-02"), validUntil: new Date("2026-10-02") };
    expect(latestOfficialPrice([current])).toMatchObject({ status: "CURRENT", price: current });
    expect(latestOfficialPrice([current, retired])).toMatchObject({ status: "LAST_KNOWN", price: retired });
  });

  it("detects a price drop and computes delivered-price history statistics", () => {
    const history = [
      { itemPrice: 24.99, totalPrice: 29.99, observedAt: new Date("2026-10-03") },
      { itemPrice: 24.99, totalPrice: 29.99, observedAt: new Date("2026-10-04") },
      { itemPrice: 19.99, totalPrice: 22.98, observedAt: new Date("2026-10-06") },
    ];
    expect(priceDrop(history)).toMatchObject({ amount: 5, percentage: 5 / 24.99 });
    expect(priceHistoryStats(history)).toMatchObject({ current: 22.98, lowest: 22.98, highest: 29.99 });
    expect(priceDrop([history[0]!])).toBeNull();
  });

  it("keeps price observations append-only", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-price-")); directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      const product = await db.product.create({ data: { canonicalKey: "offer-product", baseReference: "70201", kind: "SET", variants: { create: { canonicalKey: "offer-variant", name: "Station" } } }, include: { variants: true } });
      const retailer = await db.retailer.create({ data: { slug: "test-shop", name: "Test Shop", type: "SHOP", baseUrl: "https://shop.example" } });
      const offer = await db.offer.create({ data: { retailerId: retailer.id, variantId: product.variants[0]!.id, externalId: "offer-1", url: "https://www.ebay.fr/itm/offer-1", condition: "NEW", availability: "AVAILABLE", lastObservedAt: new Date(), observations: { create: [{ itemPrice: 39.99, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-01") }, { itemPrice: 29.99, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-02") }] } }, include: { observations: true } });
      expect(offer.observations).toHaveLength(2);
      expect((await db.priceObservation.aggregate({ where: { offerId: offer.id }, _min: { itemPrice: true }, _max: { itemPrice: true } }))._min.itemPrice?.toString()).toBe("29.99");
    } finally { await db.$disconnect(); await database.close(); }
  }, 30_000);

  it("refreshes offers idempotently, appends new observations and expires missing offers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-refresh-")); directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      await db.market.create({ data: { code: "FRANCE", name: "France" } });
      const product = await db.product.create({ data: { canonicalKey: "refresh-product", baseReference: "70201", kind: "SET", variants: { create: { canonicalKey: "refresh-variant", name: "Station" } } }, include: { variants: true } });
      const variantId = product.variants[0]!.id;
      const provider = { sourceKey: "test-commerce", sourceName: "Test Commerce", sourceBaseUrl: "https://www.ebay.fr", sourceTermsUrl: "https://www.ebay.fr/help/policies/default/ebays-rules-policies?id=4205" };
      const baseOffer = { variantId, retailerKey: "test-marketplace-fr", retailerName: "Test Marketplace", retailerBaseUrl: "https://www.ebay.fr", retailerType: "MARKETPLACE" as const, countryCode: "FR", marketCode: "FRANCE", externalId: "offer-70201", url: "https://www.ebay.fr/itm/offer-70201", condition: "NEW" as const, availability: "AVAILABLE" as const, matchConfidence: 1, matchEvidence: "EAN exact", itemPrice: 29.99, shippingPrice: 4.9, currency: "EUR", observedAt: new Date("2026-10-07T08:00:00Z") };
      expect(await persistOfferRefresh(db, provider, [variantId], [baseOffer])).toMatchObject({ createdOffers: 1, createdObservations: 1 });
      expect(await persistOfferRefresh(db, provider, [variantId], [baseOffer])).toMatchObject({ createdOffers: 0, createdObservations: 0 });
      expect(await persistOfferRefresh(db, provider, [variantId], [{ ...baseOffer, itemPrice: 27.99, observedAt: new Date("2026-10-07T12:00:00Z") }])).toMatchObject({ createdObservations: 1 });
      expect(await db.priceObservation.count()).toBe(2);
      expect(await persistOfferRefresh(db, provider, [variantId], [])).toMatchObject({ expiredOffers: 1 });
      expect(await db.offer.findFirst()).toMatchObject({ availability: "ENDED" });
      expect(await db.offer.count()).toBe(1);
    } finally { await db.$disconnect(); await database.close(); }
  }, 30_000);
});
