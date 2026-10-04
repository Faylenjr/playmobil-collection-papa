import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { calculatePromotion, exactReferenceInTitle, matchEbayItem, safeExternalOfferUrl } from "../lib/pricing";
import { ebayAdapterConfiguration, findEbayOfferCandidates } from "../lib/ebay-adapter";
import { createEmbeddedDatabaseClient } from "../src/db/embedded";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("prices and offers", () => {
  it("matches an isolated exact reference and rejects partial numbers", () => {
    expect(exactReferenceInTitle("PLAYMOBIL 70201 Station-service neuve", "70201")).toBe(true);
    expect(exactReferenceInTitle("Lot 170201 accessoires", "70201")).toBe(false);
    expect(matchEbayItem({ itemId: "x", title: "Playmobil 70201 complet", itemWebUrl: "https://www.ebay.fr/itm/x" }, "70201").accepted).toBe(true);
  });

  it("allows only known HTTPS marketplace links", () => {
    expect(safeExternalOfferUrl("https://www.ebay.fr/itm/123")).toContain("ebay.fr");
    expect(safeExternalOfferUrl("http://www.ebay.fr/itm/123")).toBeNull();
    expect(safeExternalOfferUrl("https://evil.example/redirect")).toBeNull();
  });

  it("keeps ambiguous eBay search responses out of automatic matching", async () => {
    const candidates = await findEbayOfferCandidates({ search: async () => [
      { itemId: "exact", title: "PLAYMOBIL 70201 complet", itemWebUrl: "https://www.ebay.fr/itm/exact" },
      { itemId: "partial", title: "Lot accessoires 170201", itemWebUrl: "https://www.ebay.fr/itm/partial" },
    ] }, "70201");
    expect(candidates.map(({ accepted }) => accepted)).toEqual([true, false]);
    expect(ebayAdapterConfiguration({ EBAY_ENVIRONMENT: "sandbox" })).toMatchObject({ enabled: false, environment: "sandbox" });
  });

  it("calculates a fresh comparable new promotion but never labels used goods as a promotion", () => {
    const common = { currentPrice: 30, currentCurrency: "EUR", currentMarket: "FR", listPrice: 40, listCurrency: "EUR", listMarket: "FR", observedAt: new Date("2026-10-04T10:00:00Z"), now: new Date("2026-10-04T20:00:00Z") };
    expect(calculatePromotion({ ...common, condition: "NEW" })).toBe(0.25);
    expect(calculatePromotion({ ...common, condition: "USED" })).toBeNull();
    expect(calculatePromotion({ ...common, condition: "NEW", currentCurrency: "USD" })).toBeNull();
    expect(calculatePromotion({ ...common, condition: "NEW", now: new Date("2026-10-07T20:01:00Z") })).toBeNull();
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
});
