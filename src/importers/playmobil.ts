import { load } from "cheerio";
import type { RawCollectible } from "./types.js";

export const PLAYMOBIL_DE = { key: "playmobil-de", name: "PLAYMOBIL Deutschland", baseUrl: "https://www.playmobil.com/de-de", priority: 10 } as const;
export const PLAYMOBIL_FR = { key: "playmobil-fr", name: "PLAYMOBIL France", baseUrl: "https://www.playmobil.com/fr-fr", priority: 10 } as const;

const absolute = (url: string, base: string) => new URL(url, base).href;

export function parsePlaymobilProduct(html: string, sourceUrl: string, locale = "de-DE"): RawCollectible {
  const $ = load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const bodyHtml = $("body").html() ?? html;
  const source = locale.toLowerCase().startsWith("fr") ? PLAYMOBIL_FR : PLAYMOBIL_DE;
  let jsonLd: Record<string, unknown> | undefined;
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const value = JSON.parse($(element).text()) as Record<string, unknown>;
      if (value["@type"] === "Product") jsonLd = value;
    } catch { /* Ignore unrelated malformed structured-data blocks. */ }
  });
  const reference = bodyHtml.match(/(?:Artikelnummer|Référence de l.article|Item number)\s*:\s*([A-Za-z]*\d{3,8}(?:[A-Za-z]|-[A-Za-z0-9-]+)?)(?=\s|<|&)/i)?.[1]
    ?? (typeof jsonLd?.sku === "string" ? jsonLd.sku : undefined)
    ?? new URL(sourceUrl).pathname.match(/\/([A-Za-z0-9-]+)\.html$/)?.[1];
  if (!reference) throw new Error(`Missing product reference: ${sourceUrl}`);

  const structuredName = typeof jsonLd?.name === "string" ? jsonLd.name : undefined;
  const name = structuredName ?? ($("h1").first().text().replace(/\s+/g, " ").trim() || $("meta[property='og:title']").attr("content")?.trim());
  const description = $(".pdpProductSpecifications__itemStory").first().text().replace(/\s+/g, " ").trim()
    || (typeof jsonLd?.description === "string" ? jsonLd.description : undefined)
    || $("meta[name='description']").attr("content")?.trim();
  const structuredImages = Array.isArray(jsonLd?.image) ? jsonLd.image.filter((value): value is string => typeof value === "string") : [];
  const htmlImages = $("img")
    .map((_, element) => ({ alt: $(element).attr("alt") ?? "", src: $(element).attr("src") ?? $(element).attr("data-src") ?? "" }))
    .get()
    .filter(({ src }) => src.includes("media.playmobil.com") && src.includes(reference))
    .map(({ src }) => src);
  const images = [...structuredImages, ...htmlImages]
    .map((src) => ({
      kind: /box[_ -]?front/i.test(src) ? "box_front" : /box[_ -]?back/i.test(src) ? "box_back" : /product[_ -]?detail/i.test(src) ? "main" : "gallery",
      url: absolute(src.replace(/&amp;/g, "&"), sourceUrl), copyrightOwner: "geobra Brandstätter Stiftung & Co. KG", canRehost: false,
    }))
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index);
  const instructionLinks = $("a[href]")
    .map((_, element) => $(element).attr("href") ?? "")
    .get()
    .filter((href) => /bigcontent\.io|bauanleitung|instruction/i.test(href))
    .map((href) => ({ url: absolute(href, sourceUrl), locale }))
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index);

  const details = new Map<string, string>();
  $(".pdpProductSpecifications__mainDetailItem").each((_, element) => {
    const label = $(element).find(".pdpProductSpecifications__detailItemTitle").text().replace(/\s+/g, " ").trim().replace(/:$/, "");
    const value = $(element).clone().find(".pdpProductSpecifications__detailItemTitle").remove().end().text().replace(/\s+/g, " ").trim();
    details.set(label, value);
  });
  const dimensionsValue = [...details].find(([label]) => /Produktma|Dimensions du produit/i.test(label))?.[1];
  const dimensions = dimensionsValue?.match(/([\d.,]+)\s*x\s*([\d.,]+)\s*x\s*([\d.,]+)\s*cm/i)?.slice(1).map((value) => Number(value.replace(",", ".")) * 10);
  const weightValue = [...details].find(([label]) => /Gewicht|Poids/i.test(label))?.[1];
  const weight = weightValue?.match(/([\d.,]+)\s*(kg|g)/i);
  const weightGrams = weight ? Number(weight[1]!.replace(",", ".")) * (weight[2]!.toLowerCase() === "kg" ? 1000 : 1) : undefined;
  const releaseYearText = $(".badges__badge--year").first().text().trim();
  const releaseYear = /^(?:19|20)\d{2}$/.test(releaseYearText) ? Number(releaseYearText) : undefined;
  const archive = $(".pdpMain__archiveInfoBox").length > 0;
  const ageMatch = text.match(/(?:ab|à partir de|from)\s*(\d{1,2})\s*(?:Jahren|ans|years)/i);
  const productContent = $(".pdpProductSpecifications__productContent").first().text().replace(/\s+/g, " ").trim();
  const figuresSection = productContent.match(/(?:Figuren|Personnages|Figures)\s*:\s*([^;]+)/i)?.[1];
  const figureCount = figuresSection ? [...figuresSection.matchAll(/(?:^|,)\s*(\d+)\s+/g)].reduce((sum, match) => sum + Number(match[1]), 0) : undefined;
  const offers = jsonLd?.offers && typeof jsonLd.offers === "object" ? jsonLd.offers as Record<string, unknown> : undefined;
  const listPrice = typeof offers?.price === "string" || typeof offers?.price === "number" ? Number(offers.price) : undefined;
  const listPriceCurrency = typeof offers?.priceCurrency === "string" ? offers.priceCurrency : undefined;

  return {
    source: source.key,
    externalId: reference,
    sourceUrl,
    reference,
    locale,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(name || description ? { translations: [{ locale: locale.split("-")[0]!.toLowerCase(), ...(name ? { name } : {}), ...(description ? { description } : {}) }] } : {}),
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(dimensions ? { widthMm: dimensions[0], depthMm: dimensions[1], heightMm: dimensions[2] } : {}),
    ...(weightGrams !== undefined ? { weightGrams } : {}),
    ...(ageMatch?.[1] ? { ageMin: Number(ageMatch[1]) } : {}),
    ...(figureCount !== undefined ? { figureCount } : {}),
    status: archive ? "archived" : "current",
    ...(listPrice !== undefined && Number.isFinite(listPrice) ? { listPrice } : {}),
    ...(listPriceCurrency ? { listPriceCurrency } : {}),
    ...(images.length ? { images } : {}),
    ...(instructionLinks.length ? { instructions: instructionLinks } : {}),
    raw: { name, reference, description, productContent, details: Object.fromEntries(details), releaseYear, archive },
  };
}
