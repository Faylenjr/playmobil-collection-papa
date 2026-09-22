import { PoliteHttpClient } from "./importers/http.js";
import { parseSitemapIndex, parseUrlSet } from "./importers/sitemap.js";
import { isKlickypediaSetSitemap, KLICKYPEDIA } from "./importers/klickypedia.js";
import { parsePlaymoDbStats } from "./importers/playmodb.js";

interface AuditResult {
  key: string;
  checkedAt: string;
  robots: { url: string; status?: number; notes: string[] };
  metrics: Record<string, number | string | null>;
  errors: string[];
}

async function auditKlickypedia(client: PoliteHttpClient): Promise<AuditResult> {
  const result: AuditResult = { key: "klickypedia", checkedAt: new Date().toISOString(), robots: { url: `${KLICKYPEDIA.baseUrl}/robots.txt`, notes: [] }, metrics: {}, errors: [] };
  try {
    const robots = await client.get(result.robots.url); result.robots.status = robots.status;
    if (/Disallow:\s*\/wp-json\//i.test(robots.body)) result.robots.notes.push("WordPress REST is disallowed for crawlers; importer must not use it.");
    const index = await client.get(KLICKYPEDIA.sitemap);
    const setMaps = parseSitemapIndex(index.body).filter(isKlickypediaSetSitemap);
    let urls = 0;
    for (const map of setMaps) {
      const response = await client.get(map.loc);
      if (response.status === 200) urls += parseUrlSet(response.body).length;
      else result.errors.push(`${map.loc}: HTTP ${response.status}`);
    }
    result.metrics.setSitemaps = setMaps.length;
    result.metrics.setUrls = urls;
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
  return result;
}

async function auditPlaymoDb(client: PoliteHttpClient): Promise<AuditResult> {
  const result: AuditResult = { key: "playmodb", checkedAt: new Date().toISOString(), robots: { url: "https://playmodb.org/robots.txt", notes: [] }, metrics: {}, errors: [] };
  try {
    const robots = await client.get(result.robots.url); result.robots.status = robots.status;
    if (/One moment, please/i.test(robots.body)) result.robots.notes.push("The host returned an anti-automation interstitial instead of robots.txt.");
    const stats = await client.get("https://playmodb.org/playmodb_stats.shtml");
    if (stats.status === 200 && !/One moment, please/i.test(stats.body)) Object.assign(result.metrics, parsePlaymoDbStats(stats.body));
    else result.errors.push(`Statistics unavailable: HTTP ${stats.status} or interstitial`);
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
  return result;
}

async function auditSitemapSource(
  client: PoliteHttpClient,
  key: string,
  baseUrl: string,
  sitemapUrl: string,
  childFilter: (url: string) => boolean = () => true,
): Promise<AuditResult> {
  const result: AuditResult = { key, checkedAt: new Date().toISOString(), robots: { url: `${baseUrl}/robots.txt`, notes: [] }, metrics: {}, errors: [] };
  try {
    const robots = await client.get(result.robots.url); result.robots.status = robots.status;
    const sitemap = await client.get(sitemapUrl);
    const children = parseSitemapIndex(sitemap.body);
    const urls = children.length === 0 ? parseUrlSet(sitemap.body).length : null;
    result.metrics.sitemapChildren = children.length;
    result.metrics.directUrls = urls;
    if (children.length > 0) {
      let indexedUrls = 0;
      for (const child of children.filter((entry) => childFilter(entry.loc))) {
        const response = await client.get(child.loc);
        if (response.status === 200) indexedUrls += parseUrlSet(response.body).length;
        else result.errors.push(`${child.loc}: HTTP ${response.status}`);
      }
      result.metrics.indexedUrls = indexedUrls;
    }
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
  return result;
}

export async function auditSources(): Promise<AuditResult[]> {
  const client = new PoliteHttpClient();
  const results: AuditResult[] = [];
  results.push(await auditKlickypedia(client));
  results.push(await auditPlaymoDb(client));
  const productsOnly = (url: string) => /name=products-/i.test(url);
  results.push(await auditSitemapSource(client, "playmobil-de", "https://www.playmobil.com", "https://www.playmobil.com/de-de/sitemap_index.xml", productsOnly));
  results.push(await auditSitemapSource(client, "playmobil-fr", "https://www.playmobil.com", "https://www.playmobil.com/fr-fr/sitemap_index.xml", productsOnly));
  results.push(await auditSitemapSource(client, "mundobil", "https://www.mundobil.com", "https://www.mundobil.com/sitemap_index.xml"));
  return results;
}
