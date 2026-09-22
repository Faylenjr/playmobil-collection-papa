import { load } from "cheerio";
import type { RawCollectible, SitemapEntry } from "./types.js";
import { parseSitemapIndex, parseUrlSet } from "./sitemap.js";
import { PoliteHttpClient } from "./http.js";

export const KLICKYPEDIA = {
  key: "klickypedia",
  name: "Klickypedia",
  baseUrl: "https://www.klickypedia.com",
  priority: 30,
  sitemap: "https://www.klickypedia.com/sitemap_index.xml",
} as const;

export function isKlickypediaSetSitemap(entry: SitemapEntry): boolean {
  return /\/sets-sitemap(?:\d+)?\.xml$/.test(entry.loc);
}

export async function listKlickypediaSetUrls(client = new PoliteHttpClient()): Promise<SitemapEntry[]> {
  const index = await client.get(KLICKYPEDIA.sitemap);
  if (index.status !== 200) throw new Error(`Klickypedia sitemap index returned ${index.status}`);
  const children = parseSitemapIndex(index.body).filter(isKlickypediaSetSitemap);
  const entries: SitemapEntry[] = [];
  for (const child of children) {
    const response = await client.get(child.loc);
    if (response.status !== 200) throw new Error(`${child.loc} returned ${response.status}`);
    entries.push(...parseUrlSet(response.body));
  }
  return entries;
}

export function parseKlickypediaSet(html: string, sourceUrl: string): RawCollectible {
  const $ = load(html);
  const heading = $("h1").first().text().replace(/\s+/g, " ").trim();
  const match = heading.match(/Playmobil\s+([^\s]+)\s+-\s+(.+)/i);
  if (!match?.[1]) throw new Error(`Missing reference in Klickypedia page: ${sourceUrl}`);
  const image = $("meta[property='og:image']").attr("content");
  const years = $("body").text().match(/((?:19|20)\d{2})\s*>\s*((?:19|20)\d{2}|n\/a)/i);
  return {
    source: KLICKYPEDIA.key,
    externalId: new URL(sourceUrl).pathname.replace(/^\/|\/$/g, ""),
    sourceUrl,
    reference: match[1],
    ...(match[2] ? { name: match[2].trim() } : {}),
    ...(years?.[1] ? { releaseYear: Number(years[1]) } : {}),
    ...(years?.[2] && /^\d+$/.test(years[2]) ? { discontinuedYear: Number(years[2]) } : {}),
    ...(image ? { images: [{ kind: "main", url: image, copyrightOwner: "unknown — review required" }] } : {}),
    raw: { heading },
  };
}
