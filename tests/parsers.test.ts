import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseKlickypediaSet } from "../src/importers/klickypedia.js";
import { parsePlaymobilProduct } from "../src/importers/playmobil.js";
import { parsePlaymoDbStats } from "../src/importers/playmodb.js";
import { selectBatchEntries } from "../src/jobs/import-klickypedia.js";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("source parsers", () => {
  it("parses a Klickypedia variant without downloading its image", () => {
    const item = parseKlickypediaSet(fixture("klickypedia-set.html"), "https://www.klickypedia.com/sets/70733-01-gymnast/");
    expect(item).toMatchObject({ reference: "70733v1", name: "Gymnast", releaseYear: 2021, discontinuedYear: 2022, theme: "Sports", format: "Figures", figureCount: 1, markets: ["france"] });
    expect(item.translations).toEqual(expect.arrayContaining([{ locale: "fr", name: "Gymnaste" }]));
    expect(item.images?.map((image) => image.kind)).toEqual(["main", "box_front", "box_back"]);
    expect(item.parts).toEqual([{ partNumber: "30200354", name: "Gymnastics ribbon", sourceUrl: "https://www.klickypedia.com/parts/30200354-ribbon/" }]);
    expect(item.instructions).toEqual([{ url: "https://example.invalid/70733.pdf" }]);
  });
  it("parses official product media and instructions as source URLs", () => {
    const item = parsePlaymobilProduct(fixture("playmobil-product.html"), "https://www.playmobil.com/de-de/example/71733.html");
    expect(item.reference).toBe("71733");
    expect(item).toMatchObject({ releaseYear: 2024, widthMm: 300, depthMm: 220, heightMm: 135, weightGrams: 707, figureCount: 3, status: "archived", listPrice: 19.99, listPriceCurrency: "EUR" });
    expect(item.translations).toEqual([{ locale: "de", name: "Starter Pack Polizei Ermittlungszimmer", description: "Official long description" }]);
    expect(item.images?.map((image) => image.kind)).toEqual(["main", "box_front", "box_back"]);
    expect(item.instructions).toHaveLength(1);
  });
  it("parses measured PlaymoDB headline statistics", () => {
    expect(parsePlaymoDbStats(`<body>Sets: now 7718 sets in the database Parts: now 68711 parts in the database, appearing in 6023 sets Who's that Klicky? now 7706 klickies annotated</body>`)).toEqual({ sets: 7718, parts: 68711, inventoriedSets: 6023, figures: 7706 });
  });
});

describe("sequential import batches", () => {
  const entries = Array.from({ length: 14_466 }, (_, index) => ({ loc: `https://example.test/sets/${index}/` }));

  it("covers the complete sitemap exactly once in eight 1,900-entry batches", () => {
    const batches = Array.from({ length: 8 }, (_, index) => selectBatchEntries(entries, index * 1_900, 1_900));
    const urls = batches.flat().map((entry) => entry.loc);
    expect(urls).toHaveLength(14_466);
    expect(new Set(urls).size).toBe(14_466);
    expect(batches.map((batch) => batch.length)).toEqual([1_900, 1_900, 1_900, 1_900, 1_900, 1_900, 1_900, 1_166]);
  });

  it("caps an accidental oversized batch at 2,000 pages", () => {
    expect(selectBatchEntries(entries, 0, 9_000)).toHaveLength(2_000);
  });
});
