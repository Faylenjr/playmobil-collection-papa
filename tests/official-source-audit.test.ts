import { describe, expect, it } from "vitest";
import { isSafeOfficialCandidate, parseOfficialPageObservation } from "../lib/official-source-audit";

const page = (locale: "fr" | "de", reference = "72168") => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({ "@type": "Product", sku: reference, name: locale === "fr" ? "Poulailler" : "Hühnerstall", description: "Official", image: [`https://media.playmobil.com/i/playmobil/${reference}_product_detail`, `https://media.playmobil.com/i/playmobil/${reference}_product_box_front`, `https://media.playmobil.com/i/playmobil/${reference}_product_box_back`], offers: { price: locale === "fr" ? "39.99" : "37.99", priceCurrency: "EUR", availability: "https://schema.org/InStock" } })}</script>
</head><body><h1>Product</h1><ul class="breadcrumbs__list"><li><a>Country</a></li><li><a>2024</a></li></ul>
<div class="pdpProductSpecifications__mainDetailItem"><span class="pdpProductSpecifications__detailItemTitle">${locale === "fr" ? "Dimensions de l'emballage" : "Packungsmaße"}:</span> 14.2 x 14.2 x 10.0 cm</div>
<div class="pdpProductSpecifications__mainDetailItem"><span class="pdpProductSpecifications__detailItemTitle">${locale === "fr" ? "Poids" : "Gewicht"}:</span> 231 g</div>
<div class="pdpProductSpecifications__productContent">${locale === "fr" ? "Personnages" : "Figuren"}: 1 femme, 1 garçon; accessoires</div>
</body></html>`;

describe("official PLAYMOBIL audit parsing", () => {
  it.each([["fr-FR", "fr", "Poulailler"], ["de-DE", "de", "Hühnerstall"]] as const)("parses %s observations", (market, locale, name) => {
    expect(parseOfficialPageObservation(page(locale), `https://www.playmobil.com/${locale}-${locale}/72168.html`, market)).toMatchObject({
      market, reference: "72168", name, figureCount: 2,
      packageDimensions: { width: 142, depth: 142, height: 100 },
      releaseYear: 2024, weightGrams: 231, imageKinds: ["main", "box_front", "box_back"], breadcrumbs: ["Country", "2024"],
      officialPrice: { amount: locale === "fr" ? 39.99 : 37.99, currency: "EUR", availability: "https://schema.org/InStock" },
    });
  });

  it("does not invent a total piece count from the textual inventory", () => {
    expect(parseOfficialPageObservation(page("de"), "https://example.test/72168.html", "de-DE").pieceCount).toBeUndefined();
  });

  it("does not invent zero figures when a textual inventory has no numeric quantities", () => {
    const html = page("fr").replace("1 femme, 1 garçon", "une femme, un garçon");
    expect(parseOfficialPageObservation(html, "https://example.test/72168.html", "fr-FR").figureCount).toBeUndefined();
  });

  it("stops figure counting before animals and accessories", () => {
    const html = page("fr").replace("1 femme, 1 garçon; accessoires", "1 femme 1 garçon Animaux: 3 chevaux Accessoires: 20 éléments");
    expect(parseOfficialPageObservation(html, "https://example.test/72168.html", "fr-FR").figureCount).toBe(2);
  });

  it("keeps the catalogue price separate from the current discounted official offer", () => {
    const html = page("de").replace("</body>", '<div class="pdpMain__price"><span class="price price--list price--strikeThrough"><span class="value" content="49.99">49,99 €</span></span><span class="price price--sale"><span class="value" content="37.99">37,99 €</span></span></div></body>');
    expect(parseOfficialPageObservation(html, "https://example.test/72168.html", "de-DE")).toMatchObject({
      officialPrice: { amount: 49.99, currency: "EUR" },
      officialCurrentPrice: { amount: 37.99, currency: "EUR" },
      isArchived: false,
    });
  });

  it("marks only an explicit official archive box as archived", () => {
    const html = page("fr").replace("</body>", '<div class="pdpMain__archiveInfoBox">Article retiré</div></body>');
    expect(parseOfficialPageObservation(html, "https://example.test/72168.html", "fr-FR").isArchived).toBe(true);
  });

  it("extracts a checksum-valid GTIN from an array-shaped JSON-LD block", () => {
    const structured = page("fr").replace(
      /<script type="application\/ld\+json">.*?<\/script>/,
      `<script type="application/ld+json">${JSON.stringify([{ "@type": "BreadcrumbList" }, { "@type": ["Thing", "Product"], sku: "72216", gtin13: "4008789722164", name: "Calèche des licornes" }])}</script>`,
    );
    expect(parseOfficialPageObservation(structured, "https://www.playmobil.com/fr-fr/72216.html", "fr-FR").officialIdentifiers).toEqual([
      { type: "OFFICIAL_SKU", rawValue: "72216" },
      { type: "GTIN", rawValue: "4008789722164" },
    ]);
  });

  it("accepts an assigned unique numeric base including a suffixed market variant", () => {
    expect(isSafeOfficialCandidate({ identityClass: "ASSIGNED", baseValue: "72168", variantsUsingBase: 1 })).toBe(true);
  });

  it.each([
    { identityClass: "PLACEHOLDER" as const, baseValue: "00000", variantsUsingBase: 1 },
    { identityClass: "REUSED" as const, baseValue: "72168", variantsUsingBase: 2 },
    { identityClass: "AMBIGUOUS" as const, baseValue: "72168", variantsUsingBase: 1 },
  ])("rejects unsafe identity $identityClass", (candidate) => {
    expect(isSafeOfficialCandidate(candidate)).toBe(false);
  });
});
