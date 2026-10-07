import { load } from "cheerio";

export type OfficialMarket = "fr-FR" | "de-DE" | "en-US";

export type DimensionsMm = { width: number; depth: number; height: number };

export interface OfficialPageObservation {
  market: OfficialMarket;
  sourceUrl: string;
  reference: string;
  name?: string;
  description?: string;
  releaseYear?: number;
  figureCount?: number;
  pieceCount?: number;
  packageDimensions?: DimensionsMm;
  productDimensions?: DimensionsMm;
  weightGrams?: number;
  imageKinds: string[];
  officialImages?: Array<{ url: string; kind: "box_front" | "box_back" | "main" | "gallery" }>;
  officialIdentifiers?: Array<{ type: "GTIN" | "MPN" | "OFFICIAL_SKU"; rawValue: string }>;
  breadcrumbs: string[];
  isArchived?: boolean;
  officialPrice?: { amount: number; currency: string; availability?: string };
  officialCurrentPrice?: { amount: number; currency: string; availability?: string };
}

const dimensionPattern = /([\d.,]+)\s*x\s*([\d.,]+)\s*x\s*([\d.,]+)\s*cm/i;

function dimensions(value: string | undefined): DimensionsMm | undefined {
  const match = value?.match(dimensionPattern);
  if (!match) return undefined;
  const numbers = match.slice(1).map((part) => Number(part!.replace(",", ".")) * 10);
  if (numbers.some((number) => !Number.isFinite(number) || number <= 0)) return undefined;
  return { width: numbers[0]!, depth: numbers[1]!, height: numbers[2]! };
}

function structuredProduct($: ReturnType<typeof load>): Record<string, unknown> | undefined {
  let product: Record<string, unknown> | undefined;
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const value = JSON.parse($(element).text()) as Record<string, unknown>;
      if (value["@type"] === "Product") product = value;
      const graph = Array.isArray(value["@graph"]) ? value["@graph"] as Array<Record<string, unknown>> : [];
      product ??= graph.find((entry) => entry["@type"] === "Product");
    } catch { /* Other structured-data blocks may be malformed or unrelated. */ }
  });
  return product;
}

export function parseOfficialPageObservation(html: string, sourceUrl: string, market: OfficialMarket): OfficialPageObservation {
  const $ = load(html);
  const product = structuredProduct($);
  const bodyHtml = $("body").html() ?? html;
  const reference = bodyHtml.match(/(?:Artikelnummer|Référence de l.article|Item number)\s*:\s*([A-Za-z]*\d{3,8}[A-Za-z]?)/i)?.[1]
    ?? (typeof product?.sku === "string" ? product.sku : undefined);
  if (!reference) throw new Error(`Missing official reference: ${sourceUrl}`);

  const details = new Map<string, string>();
  $(".pdpProductSpecifications__mainDetailItem").each((_, element) => {
    const label = $(element).find(".pdpProductSpecifications__detailItemTitle").text().replace(/\s+/g, " ").trim().replace(/:$/, "");
    const value = $(element).clone().find(".pdpProductSpecifications__detailItemTitle").remove().end().text().replace(/\s+/g, " ").trim();
    details.set(label, value);
  });
  const detail = (pattern: RegExp) => [...details].find(([label]) => pattern.test(label))?.[1];
  const content = $(".pdpProductSpecifications__productContent").first().text().replace(/\s+/g, " ").trim();
  const figures = content.match(/(?:Figuren|Personnages|Figures)\s*:\s*(.*?)(?=(?:Tiere|Animals|Animaux|Zubehör|Accessories|Accessoires)\s*:|$)/i)?.[1];
  const figureQuantities = figures ? [...figures.matchAll(/\b(\d+)\s+/g)] : [];
  const figureCount = figureQuantities.length ? figureQuantities.reduce((sum, match) => sum + Number(match[1]), 0) : undefined;
  const weight = detail(/Gewicht|Poids|Weight/i)?.match(/([\d.,]+)\s*(kg|g)/i);
  const weightGrams = weight ? Number(weight[1]!.replace(",", ".")) * (weight[2]!.toLowerCase() === "kg" ? 1000 : 1) : undefined;
  const explicitPieces = [product?.numberOfPieces, product?.pieceCount].find((value) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)));
  const packageDimensions = dimensions(detail(/Packungsma|Dimensions de l.emballage|Package dimensions/i));
  const productDimensions = dimensions(detail(/Produktma|Dimensions du produit|Product dimensions/i));
  const images = Array.isArray(product?.image) ? product.image.filter((value): value is string => typeof value === "string") : [];
  const officialImages = images.map((url) => ({
    url,
    kind: (/box[_ -]?front/i.test(url) ? "box_front" : /box[_ -]?back/i.test(url) ? "box_back" : /product[_ -]?detail/i.test(url) ? "main" : "gallery") as "box_front" | "box_back" | "main" | "gallery",
  }));
  const imageKinds = [...new Set(officialImages.map(({ kind }) => kind))];
  const officialIdentifiers: OfficialPageObservation["officialIdentifiers"] = [];
  if (typeof product?.sku === "string" && product.sku.trim()) officialIdentifiers.push({ type: "OFFICIAL_SKU", rawValue: product.sku.trim() });
  if (typeof product?.mpn === "string" && product.mpn.trim()) officialIdentifiers.push({ type: "MPN", rawValue: product.mpn.trim() });
  for (const key of ["gtin", "gtin8", "gtin12", "gtin13", "gtin14"] as const) {
    const value = product?.[key];
    if (typeof value === "string" && value.trim()) officialIdentifiers.push({ type: "GTIN", rawValue: value.trim() });
  }
  const breadcrumbs = $(".breadcrumbs__list a").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get().filter(Boolean);
  const isArchived = $(".pdpMain__archiveInfoBox").length > 0;
  const releaseYearText = $(".badges__badge--year").first().text().trim() || breadcrumbs.findLast((value) => /^(?:19|20)\d{2}$/.test(value));
  const releaseYear = releaseYearText && /^(?:19|20)\d{2}$/.test(releaseYearText) ? Number(releaseYearText) : undefined;
  const name = typeof product?.name === "string" ? product.name : $("h1").first().text().replace(/\s+/g, " ").trim();
  const description = typeof product?.description === "string" ? product.description : undefined;
  const offer = product?.offers && typeof product.offers === "object" ? product.offers as Record<string, unknown> : undefined;
  const offerAmount = typeof offer?.price === "number" ? offer.price : typeof offer?.price === "string" ? Number(offer.price.replace(",", ".")) : undefined;
  const offerCurrency = typeof offer?.priceCurrency === "string" && /^[A-Z]{3}$/.test(offer.priceCurrency) ? offer.priceCurrency : undefined;
  const currentPrice = offerAmount !== undefined && Number.isFinite(offerAmount) && offerAmount >= 0 && offerCurrency
    ? { amount: offerAmount, currency: offerCurrency, ...(typeof offer?.availability === "string" ? { availability: offer.availability } : {}) }
    : undefined;
  const listPriceRaw = $(".pdpMain__price .price--list .value").first().attr("content");
  const listPriceAmount = listPriceRaw ? Number(listPriceRaw.replace(",", ".")) : undefined;
  const officialPrice = listPriceAmount !== undefined && Number.isFinite(listPriceAmount) && listPriceAmount >= 0 && offerCurrency
    ? { amount: listPriceAmount, currency: offerCurrency, ...(typeof offer?.availability === "string" ? { availability: offer.availability } : {}) }
    : currentPrice;

  return {
    market, sourceUrl, reference, ...(name ? { name } : {}), ...(description ? { description } : {}),
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(figureCount !== undefined ? { figureCount } : {}),
    ...(explicitPieces !== undefined ? { pieceCount: Number(explicitPieces) } : {}),
    ...(packageDimensions ? { packageDimensions } : {}),
    ...(productDimensions ? { productDimensions } : {}),
    ...(weightGrams !== undefined && Number.isFinite(weightGrams) ? { weightGrams } : {}),
    imageKinds, ...(officialImages.length ? { officialImages } : {}), isArchived,
    ...(officialIdentifiers.length ? { officialIdentifiers } : {}), breadcrumbs, ...(officialPrice ? { officialPrice } : {}),
    ...(currentPrice ? { officialCurrentPrice: currentPrice } : {}),
  };
}

export function isSafeOfficialCandidate(input: {
  identityClass: "ASSIGNED" | "PLACEHOLDER" | "REUSED" | "AMBIGUOUS";
  baseValue: string | null;
  variantsUsingBase: number;
}) {
  return input.identityClass === "ASSIGNED"
    && /^\d{3,8}$/.test(input.baseValue ?? "")
    && !/^0+$/.test(input.baseValue ?? "")
    && input.variantsUsingBase === 1;
}
