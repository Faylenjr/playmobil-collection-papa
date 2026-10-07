import { describe, expect, it } from "vitest";
import { KelkooPublisherClient, matchKelkooOffer } from "../lib/kelkoo-adapter";
import { buildPriceObservation } from "../lib/offer-observations";

describe("offer adapters", () => {
  it("matches Kelkoo by exact EAN before title", () => expect(matchKelkooOffer({ offerId: "1", title: "Lot de jouets", offerUrl: "https://www.kelkoo.fr/x", codeEan: "4008789722164", price: 19.99, currency: "EUR" }, { reference: "72216", eans: ["4008789722164"] })).toMatchObject({ accepted: true, confidence: 1 }));
  it("requires the PLAYMOBIL brand when Kelkoo only supplies a matching reference", () => {
    expect(matchKelkooOffer({ offerId: "1", title: "PLAYMOBIL 72216", brand: "PLAYMOBIL", offerUrl: "https://www.kelkoo.fr/x", price: 19.99, currency: "EUR" }, { reference: "72216", eans: [] }).accepted).toBe(true);
    expect(matchKelkooOffer({ offerId: "1b", title: "PLAYMOBIL 72216 - coffret", offerUrl: "https://www.kelkoo.fr/x", price: 19.99, currency: "EUR" }, { reference: "72216", eans: [] })).toMatchObject({ accepted: true, confidence: 0.95 });
    expect(matchKelkooOffer({ offerId: "2", title: "Compatible 72216", brand: "Autre", offerUrl: "https://www.kelkoo.fr/x", price: 9.99, currency: "EUR" }, { reference: "72216", eans: [] }).accepted).toBe(false);
    expect(matchKelkooOffer({ offerId: "3", title: "PLAYMOBIL 72216", brand: "Autre", offerUrl: "https://www.kelkoo.fr/x", price: 9.99, currency: "EUR" }, { reference: "72216", eans: [] }).accepted).toBe(false);
  });
  it("rejects a keyword-only candidate", () => expect(matchKelkooOffer({ offerId: "1", title: "PLAYMOBIL licorne", offerUrl: "https://www.kelkoo.fr/x", price: 19.99, currency: "EUR" }, { reference: "72216", eans: [] }).accepted).toBe(false));
  it("calls the Kelkoo Publisher API with the bearer token and parses delivered totals", async () => {
    let requestedUrl = ""; let authorization = "";
    const request = async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input); authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ offers: [{ offerId: "k-1", title: "PLAYMOBIL 72216", price: 24.99, deliveryCost: 4.9, totalPrice: 29.89, currency: "eur", goUrl: "https://fr-go.kelkoogroup.net/x", codeEan: "4008789722164", brand: { name: "PLAYMOBIL" }, merchant: { id: "12", name: "Jouets Test" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const offers = await new KelkooPublisherClient("secret", "fr", request as typeof fetch).search("72216");
    expect(authorization).toBe("Bearer secret");
    expect(requestedUrl).toContain("country=fr");
    expect(requestedUrl).toContain("PLAYMOBIL+72216");
    expect(offers[0]).toMatchObject({ offerId: "k-1", merchantName: "Jouets Test", deliveryCost: 4.9, totalPrice: 29.89, currency: "EUR" });
  });
  it("builds a new append-only observation value without mutating an old one", () => {
    const first = buildPriceObservation({ itemPrice: 20, shippingPrice: 4.9, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-05T10:00:00Z") });
    const second = buildPriceObservation({ itemPrice: 18, shippingPrice: 4.9, currency: "EUR", availability: "AVAILABLE", observedAt: new Date("2026-10-06T10:00:00Z") });
    expect(first.totalPrice).toBe(24.9); expect(second.totalPrice).toBe(22.9); expect(first.itemPrice).toBe(20);
  });
});
