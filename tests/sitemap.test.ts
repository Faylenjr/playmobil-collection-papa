import { describe, expect, it } from "vitest";
import { parseSitemapIndex, parseUrlSet } from "../src/importers/sitemap.js";

describe("sitemap parsers", () => {
  it("handles a single sitemap without array-shape bugs", () => {
    expect(parseSitemapIndex(`<sitemapindex><sitemap><loc>https://example.test/a.xml</loc><lastmod>2026-01-01</lastmod></sitemap></sitemapindex>`)).toEqual([
      { loc: "https://example.test/a.xml", lastmod: "2026-01-01" },
    ]);
  });
  it("handles multiple URLs", () => {
    expect(parseUrlSet(`<urlset><url><loc>https://example.test/1</loc></url><url><loc>https://example.test/2</loc></url></urlset>`)).toHaveLength(2);
  });
});
