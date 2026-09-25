import { load } from "cheerio";

export type OfficialMarket = "fr-FR" | "de-DE";

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
  breadcrumbs: string[];
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
  const bodyText = $("body").text().replace(/\s+/g, " ");
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
  const figures = content.match(/(?:Figuren|Personnages|Figures)\s*:\s*([^;]+)/i)?.[1];
  const figureQuantities = figures ? [...figures.matchAll(/(?:^|,)\s*(\d+)\s+/g)] : [];
  const figureCount = figureQuantities.length ? figureQuantities.reduce((sum, match) => sum + Number(match[1]), 0) : undefined;
  const weight = detail(/Gewicht|Poids|Weight/i)?.match(/([\d.,]+)\s*(kg|g)/i);
  const weightGrams = weight ? Number(weight[1]!.replace(",", ".")) * (weight[2]!.toLowerCase() === "kg" ? 1000 : 1) : undefined;
  const explicitPieces = [product?.numberOfPieces, product?.pieceCount].find((value) => typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value)));
  const packageDimensions = dimensions(detail(/Packungsma|Dimensions de l.emballage|Package dimensions/i));
  const productDimensions = dimensions(detail(/Produktma|Dimensions du produit|Product dimensions/i));
  const images = Array.isArray(product?.image) ? product.image.filter((value): value is string => typeof value === "string") : [];
  const imageKinds = [...new Set(images.map((url) => /box[_ -]?front/i.test(url) ? "box_front" : /box[_ -]?back/i.test(url) ? "box_back" : /product[_ -]?detail/i.test(url) ? "main" : "gallery"))];
  const breadcrumbs = $(".breadcrumbs__list a").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get().filter(Boolean);
  const releaseYearText = $(".badges__badge--year").first().text().trim() || breadcrumbs.findLast((value) => /^(?:19|20)\d{2}$/.test(value));
  const releaseYear = releaseYearText && /^(?:19|20)\d{2}$/.test(releaseYearText) ? Number(releaseYearText) : undefined;
  const name = typeof product?.name === "string" ? product.name : $("h1").first().text().replace(/\s+/g, " ").trim();
  const description = typeof product?.description === "string" ? product.description : undefined;

  return {
    market, sourceUrl, reference, ...(name ? { name } : {}), ...(description ? { description } : {}),
    ...(releaseYear !== undefined ? { releaseYear } : {}),
    ...(figureCount !== undefined ? { figureCount } : {}),
    ...(explicitPieces !== undefined ? { pieceCount: Number(explicitPieces) } : {}),
    ...(packageDimensions ? { packageDimensions } : {}),
    ...(productDimensions ? { productDimensions } : {}),
    ...(weightGrams !== undefined && Number.isFinite(weightGrams) ? { weightGrams } : {}),
    imageKinds, breadcrumbs,
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
