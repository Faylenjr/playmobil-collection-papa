import { createHash } from "node:crypto";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { RawCollectible, SitemapEntry } from "./types.js";
import { parseSitemapIndex, parseUrlSet } from "./sitemap.js";
import { PoliteHttpClient } from "./http.js";
import { isGenericSourceMedia } from "../domain/source-media.js";

export const KLICKYPEDIA = {
  key: "klickypedia",
  name: "Klickypedia",
  baseUrl: "https://www.klickypedia.com",
  priority: 30,
  sitemap: "https://www.klickypedia.com/sitemap_index.xml",
} as const;

const LOCALES: Record<string, string> = { English: "en", "Español": "es", Deutsch: "de", "Français": "fr" };
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const meaningful = (value: string) => {
  const normalized = clean(value).replace(/\(wrong\?\)/gi, "").trim();
  return /^(?:\(n\/a\)|n\/a|none)?$/i.test(normalized) ? undefined : normalized;
};
const slug = (value: string) => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function textUntilBreak($: CheerioAPI, start: Cheerio<any>): string {
  const values: string[] = [];
  let node = start.get(0)?.nextSibling;
  while (node && !(node.type === "tag" && node.name === "br")) {
    if (!(node.type === "tag" && $(node).is("a[aria-label='Edit'], a[aria-label='Report error'], .sets-contador"))) values.push($(node).text());
    node = node.nextSibling;
  }
  return clean(values.join(" "));
}

function fieldAfterLabel($: CheerioAPI, container: Cheerio<any>, label: string): { text?: string; links: string[] } {
  const strong = container.find("strong").filter((_, element) => clean($(element).text()).replace(/:$/, "").toLowerCase() === label.toLowerCase()).first();
  if (!strong.length) return { links: [] };
  const links: string[] = [];
  const values: string[] = [];
  let node = strong.get(0)?.nextSibling;
  while (node && !(node.type === "tag" && node.name === "br")) {
    const current = $(node);
    if (node.type === "tag" && node.name === "a") {
      const href = current.attr("href");
      if (href && !href.includes("/editor/")) links.push(href);
    }
    if (!(node.type === "tag" && current.is(".sets-contador, a[aria-label='Edit'], a[aria-label='Report error']"))) values.push(current.text());
    node = node.nextSibling;
  }
  const text = meaningful(values.join(" "));
  return { ...(text ? { text } : {}), links };
}

function parseYear(value?: string): number | undefined {
  const match = value?.match(/\b(?:19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

function absoluteUrl(url: string, sourceUrl: string): string { return new URL(url, sourceUrl).toString(); }

function parseLinkedEntities($: CheerioAPI, headingText: string, path: string) {
  const heading = $("h4.block-title").filter((_, element) => clean($(element).text()).toUpperCase() === headingText).first();
  if (!heading.length) return [];
  return heading.nextAll(".yarpp-thumbnails-horizontal").first().find(`a[href*='/${path}/']`).map((_, element) => {
    const anchor = $(element);
    const title = clean(anchor.attr("title") ?? anchor.text());
    const match = title.match(/^([^\s]+)\s+-\s+(.+)$/);
    const href = anchor.attr("href");
    return match?.[1] && href ? { key: match[1], name: match[2], sourceUrl: href } : undefined;
  }).get().filter((value): value is { key: string; name: string; sourceUrl: string } => Boolean(value));
}

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

export function parseKlickypediaSet(html: string, sourceUrl: string, contentHash = createHash("sha256").update(html).digest("hex")): RawCollectible {
  const $ = load(html);
  const article = $("article.type-sets").first();
  const heading = clean(article.find("h1.entry-title").first().text() || $("h1").first().text());
  const match = heading.match(/^Playmobil\s+(.+?)\s*-\s*(.*)$/i);
  if (!match?.[1]) throw new Error(`Missing reference in Klickypedia page: ${sourceUrl}`);

  const info = article.find(".caja_set_info").first();
  const translations = info.find("img[alt]").map((_, element) => {
    const locale = LOCALES[$(element).attr("alt") ?? ""];
    const name = meaningful(textUntilBreak($, $(element)));
    return locale && name ? { locale, name } : undefined;
  }).get().filter((value): value is { locale: string; name: string } => Boolean(value));

  const themeField = fieldAfterLabel($, info, "Theme");
  const formatField = fieldAfterLabel($, info, "Format");
  const releaseField = fieldAfterLabel($, info, "Released");
  const discontinuedField = fieldAfterLabel($, info, "Discontinued");
  const exclusiveField = fieldAfterLabel($, info, "Exclusive");
  const marketField = fieldAfterLabel($, info, "Export Market");
  const figureField = fieldAfterLabel($, info, "Figures");

  const theme = meaningful(themeField.text ?? "");
  const format = meaningful(formatField.text ?? "");
  const exclusive = meaningful(exclusiveField.text ?? "");
  const markets = marketField.links.filter((href) => href.includes("/export-markets/")).map((href) => decodeURIComponent(new URL(href, sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "")).filter(Boolean);
  if (markets.length === 0 && marketField.text) markets.push(...marketField.text.split(/[,/]/).map(clean).filter((value) => value && !/^none$/i.test(value)));

  const seenImages = new Set<string>();
  const images: NonNullable<RawCollectible["images"]> = [];
  const addImage = (kind: string, url?: string) => {
    if (!url) return;
    const normalized = absoluteUrl(url, sourceUrl);
    if (normalized.includes("summary-sets-images") || isGenericSourceMedia(normalized) || seenImages.has(normalized)) return;
    seenImages.add(normalized);
    images.push({ kind, url: normalized, copyrightOwner: "unknown — review required", canRehost: false });
  };
  addImage("main", article.find(".set_image").first().closest("a").attr("href") ?? $("meta[property='og:image']").attr("content"));
  article.find("a[rel^='lightbox[set]']").each((_, element) => {
    const anchor = $(element);
    const label = clean(`${anchor.attr("title") ?? ""} ${anchor.find("img").attr("title") ?? ""} ${anchor.find("img").attr("alt") ?? ""}`).toLowerCase();
    addImage(/\bback\b|rear/.test(label) ? "box_back" : /\bbox\b|front/.test(label) ? "box_front" : "gallery", anchor.attr("href"));
  });

  const instructions = article.find("a[href]").map((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href");
    const label = clean(`${anchor.text()} ${anchor.attr("title") ?? ""}`).toLowerCase();
    return href && (/\.pdf(?:$|\?)/i.test(href) || /instruction manual|instructions|notice/.test(label)) ? { url: absoluteUrl(href, sourceUrl) } : undefined;
  }).get().filter((value): value is { url: string } => Boolean(value));

  const partEntities = parseLinkedEntities($, "PARTS IN THIS SET", "parts");
  const figureEntities = parseLinkedEntities($, "FIGURES IN THIS SET", "figures");
  const sourceUpdatedAt = article.find(".post-date.updated").first().text().trim() || $("meta[property='article:modified_time']").attr("content");
  const tags = info.find(".settags a").map((_, element) => clean($(element).text())).get().filter(Boolean);
  const primaryName =
    translations.find((translation) => translation.locale === "en")?.name
    ?? meaningful(match[2] ?? "")
    ?? new URL(sourceUrl).pathname
      .replace(/^\/sets\/|\/$/g, "")
      .replace(/^[^-]+-/, "")
      .replace(/-/g, " ");
  const promotionSignal = [format, exclusive, ...tags].filter(Boolean).join(" ");
  const releaseYear = parseYear(releaseField.text);
  const discontinuedYear = parseYear(discontinuedField.text);

  return {
    source: KLICKYPEDIA.key,
    externalId: new URL(sourceUrl).pathname.replace(/^\/|\/$/g, ""),
    sourceUrl,
    reference: match[1],
    name: primaryName,
    locale: "en",
    translations,
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(discontinuedYear !== undefined ? { discontinuedYear } : {}),
    ...(theme ? { theme, themes: [theme] } : {}),
    ...(format ? { format } : {}),
    ...(exclusive ? { exclusive, isExclusive: true } : {}),
    ...(markets.length ? { markets } : {}),
    ...(tags.length ? { tags } : {}),
    ...(/promotional|promotion/i.test(promotionSignal) ? { isPromotion: true } : {}),
    ...(figureField.text && /^\d+$/.test(clean(figureField.text)) ? { figureCount: Number(clean(figureField.text)) } : {}),
    ...(figureEntities.length ? { figures: figureEntities.map((figure) => ({ key: figure.key, name: figure.name })) } : {}),
    ...(partEntities.length ? { parts: partEntities.map((part) => ({ partNumber: part.key, name: part.name, sourceUrl: part.sourceUrl })) } : {}),
    ...(images.length ? { images } : {}),
    ...(instructions.length ? { instructions } : {}),
    ...(sourceUpdatedAt ? { sourceUpdatedAt } : {}),
    contentHash,
    raw: { heading, theme, format, exclusive, markets, tags, translations, imageCount: images.length, instructionCount: instructions.length, figureCount: figureField.text, linkedFigures: figureEntities.length, linkedParts: partEntities.length, postId: article.attr("id")?.replace(/^post-/, "") },
  };
}

export const klickypediaThemeSlug = slug;
