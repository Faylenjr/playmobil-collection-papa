import { load } from "cheerio";
import type { RawCollectible } from "./types.js";

export const PLAYMOBIL_DE = { key: "playmobil-de", name: "PLAYMOBIL Deutschland", baseUrl: "https://www.playmobil.com/de-de", priority: 10 } as const;

const absolute = (url: string, base: string) => new URL(url, base).href;

export function parsePlaymobilProduct(html: string, sourceUrl: string, locale = "de-DE"): RawCollectible {
  const $ = load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const bodyHtml = $("body").html() ?? html;
  const reference = bodyHtml.match(/(?:Artikelnummer|Référence de l.article|Item number)\s*:\s*([A-Za-z]*\d{3,8}(?:[A-Za-z]|-[A-Za-z0-9-]+)?)(?=\s|<|&)/i)?.[1]
    ?? new URL(sourceUrl).pathname.match(/\/([A-Za-z0-9-]+)\.html$/)?.[1];
  if (!reference) throw new Error(`Missing product reference: ${sourceUrl}`);

  const name = $("h1").first().text().replace(/\s+/g, " ").trim() || $("meta[property='og:title']").attr("content")?.trim();
  const description = $("meta[name='description']").attr("content")?.trim();
  const images = $("img")
    .map((_, element) => ({ alt: $(element).attr("alt") ?? "", src: $(element).attr("src") ?? $(element).attr("data-src") ?? "" }))
    .get()
    .filter(({ src }) => src.includes("media.playmobil.com") && src.includes(reference))
    .map(({ alt, src }) => ({
      kind: /box[_ -]?front/i.test(`${alt} ${src}`) ? "box_front" : /box[_ -]?back/i.test(`${alt} ${src}`) ? "box_back" : "product",
      url: absolute(src, sourceUrl),
      copyrightOwner: "geobra Brandstätter Stiftung & Co. KG",
    }))
    .filter((item, index, all) => all.findIndex((other) => other.url === item.url) === index);
  const instructionLinks = $("a[href]")
    .map((_, element) => $(element).attr("href") ?? "")
    .get()
    .filter((href) => /bigcontent\.io|bauanleitung|instruction/i.test(href))
    .map((href) => ({ url: absolute(href, sourceUrl), locale }));

  return {
    source: PLAYMOBIL_DE.key,
    externalId: reference,
    sourceUrl,
    reference,
    locale,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(images.length ? { images } : {}),
    ...(instructionLinks.length ? { instructions: instructionLinks } : {}),
    raw: { name, reference },
  };
}
