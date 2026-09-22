import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseKlickypediaSet } from "../src/importers/klickypedia.js";
import { parsePlaymobilProduct } from "../src/importers/playmobil.js";
import { parsePlaymoDbStats } from "../src/importers/playmodb.js";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("source parsers", () => {
  it("parses a Klickypedia variant without downloading its image", () => {
    const item = parseKlickypediaSet(fixture("klickypedia-set.html"), "https://www.klickypedia.com/sets/70733-01-gymnast/");
    expect(item).toMatchObject({ reference: "70733v1", name: "Gymnast", releaseYear: 2021, discontinuedYear: 2022 });
    expect(item.images?.[0]?.url).toContain("summary-sets-images");
  });
  it("parses official product media and instructions as source URLs", () => {
    const item = parsePlaymobilProduct(fixture("playmobil-product.html"), "https://www.playmobil.com/de-de/example/71733.html");
    expect(item.reference).toBe("71733");
    expect(item.images?.map((image) => image.kind)).toEqual(["box_front", "box_back"]);
    expect(item.instructions).toHaveLength(1);
  });
  it("parses measured PlaymoDB headline statistics", () => {
    expect(parsePlaymoDbStats(`<body>Sets: now 7718 sets in the database Parts: now 68711 parts in the database, appearing in 6023 sets Who's that Klicky? now 7706 klickies annotated</body>`)).toEqual({ sets: 7718, parts: 68711, inventoriedSets: 6023, figures: 7706 });
  });
});
