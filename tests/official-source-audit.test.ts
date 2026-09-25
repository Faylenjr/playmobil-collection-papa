import { describe, expect, it } from "vitest";
import { isSafeOfficialCandidate, parseOfficialPageObservation } from "../lib/official-source-audit";

const page = (locale: "fr" | "de", reference = "72168") => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({ "@type": "Product", sku: reference, name: locale === "fr" ? "Poulailler" : "Hühnerstall", description: "Official", image: [`https://media.playmobil.com/i/playmobil/${reference}_product_detail`, `https://media.playmobil.com/i/playmobil/${reference}_product_box_front`, `https://media.playmobil.com/i/playmobil/${reference}_product_box_back`] })}</script>
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
    });
  });

  it("does not invent a total piece count from the textual inventory", () => {
    expect(parseOfficialPageObservation(page("de"), "https://example.test/72168.html", "de-DE").pieceCount).toBeUndefined();
  });

  it("does not invent zero figures when a textual inventory has no numeric quantities", () => {
    const html = page("fr").replace("1 femme, 1 garçon", "une femme, un garçon");
    expect(parseOfficialPageObservation(html, "https://example.test/72168.html", "fr-FR").figureCount).toBeUndefined();
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
