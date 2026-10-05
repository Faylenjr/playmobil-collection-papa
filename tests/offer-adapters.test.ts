import { describe, expect, it } from "vitest";
import { matchKelkooOffer } from "../lib/kelkoo-adapter";
import { buildPriceObservation } from "../lib/offer-observations";

describe("offer adapters", () => {
  it("matches Kelkoo by exact EAN before title", () => expect(matchKelkooOffer({ offerId: "1", title: "Lot de jouets", offerUrl: "https://www.kelkoo.fr/x", codeEan: "4008789722164", price: 19.99, currency: "EUR" }, { reference: "72216", eans: ["4008789722164"] })).toMatchObject({ accepted: true, confidence: 1 }));
  it("rejects a keyword-only candidate", () => expect(matchKelkooOffer({ offerId: "1", title: "PLAYMOBIL licorne", offerUrl: "https://www.kelkoo.fr/x", price: 19.99, currency: "EUR" }, { reference: "72216", eans: [] }).accepted).toBe(false));
  it("builds a new append-only observation value without mutating an old one", () => {
    const first = buildPriceObservation({ itemPrice: 20, shippingPrice: 4.9, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-05T10:00:00Z") });
    const second = buildPriceObservation({ itemPrice: 18, shippingPrice: 4.9, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-06T10:00:00Z") });
    expect(first.totalPrice).toBe(24.9); expect(second.totalPrice).toBe(22.9); expect(first.itemPrice).toBe(20);
  });
});
