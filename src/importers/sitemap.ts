import { XMLParser } from "fast-xml-parser";
import type { SitemapEntry } from "./types.js";

const parser = new XMLParser({ ignoreAttributes: false });
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

export function parseSitemapIndex(xml: string): SitemapEntry[] {
  const document = parser.parse(xml) as { sitemapindex?: { sitemap?: { loc?: string; lastmod?: string } | Array<{ loc?: string; lastmod?: string }> } };
  return array(document.sitemapindex?.sitemap)
    .filter((item): item is { loc: string; lastmod?: string } => typeof item.loc === "string")
    .map((item) => ({ loc: item.loc, ...(item.lastmod ? { lastmod: item.lastmod } : {}) }));
}

export function parseUrlSet(xml: string): SitemapEntry[] {
  const document = parser.parse(xml) as { urlset?: { url?: { loc?: string; lastmod?: string } | Array<{ loc?: string; lastmod?: string }> } };
  return array(document.urlset?.url)
    .filter((item): item is { loc: string; lastmod?: string } => typeof item.loc === "string")
    .map((item) => ({ loc: item.loc, ...(item.lastmod ? { lastmod: item.lastmod } : {}) }));
}
