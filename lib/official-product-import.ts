import { normalizeProductIdentifier, type ProductIdentifierTypeValue } from "./product-identifiers";
import type { OfficialMarket, OfficialPageObservation } from "./official-source-audit";

export const officialMissing2026References = ["72216", "72220", "72221", "72222", "72224", "72269", "72365", "72366", "72367", "72368"] as const;
export const discoveryOnly2026References = ["71520", "72240"] as const;

export const officialMarketConfig: Record<OfficialMarket, { code: string; locale: string; sourceKey: string; sourceName: string; baseUrl: string }> = {
  "fr-FR": { code: "FRANCE", locale: "fr", sourceKey: "playmobil-official-fr", sourceName: "PLAYMOBIL France officiel", baseUrl: "https://www.playmobil.com/fr-fr" },
  "de-DE": { code: "GERMANY", locale: "de", sourceKey: "playmobil-official-de", sourceName: "PLAYMOBIL Allemagne officiel", baseUrl: "https://www.playmobil.com/de-de" },
  "en-US": { code: "USA-PLAYMOBIL", locale: "en", sourceKey: "playmobil-official-us", sourceName: "PLAYMOBIL USA officiel", baseUrl: "https://www.playmobil.com/en-us" },
};

export type OfficialImportSnapshot = {
  observedAt: string;
  observations: Array<OfficialPageObservation & { confirmed: boolean; httpStatus?: number | null }>;
};

export function buildOfficialProductImportPlan(snapshot: OfficialImportSnapshot, existingReferences: ReadonlySet<string>) {
  return officialMissing2026References.map((reference) => {
    const observations = snapshot.observations.filter((item) => item.reference === reference && item.confirmed);
    const names = observations.filter((item) => item.name).map((item) => ({ market: item.market, locale: officialMarketConfig[item.market].locale, value: item.name! }));
    const preferredName = names.find((item) => item.locale === "fr")?.value ?? names.find((item) => item.locale === "de")?.value ?? names.find((item) => item.locale === "en")?.value ?? null;
    const releaseYears = [...new Set(observations.map((item) => item.releaseYear).filter((year): year is number => year !== undefined))];
    const pieceCounts = [...new Set(observations.map((item) => item.pieceCount).filter((value): value is number => value !== undefined))];
    const figureCounts = [...new Set(observations.map((item) => item.figureCount).filter((value): value is number => value !== undefined))];
    const weights = [...new Set(observations.map((item) => item.weightGrams).filter((value): value is number => value !== undefined))];
    const packageDimensions = [...new Map(observations.flatMap((item) => item.packageDimensions ? [[JSON.stringify(item.packageDimensions), item.packageDimensions] as const] : [])).values()];
    const productDimensions = [...new Map(observations.flatMap((item) => item.productDimensions ? [[JSON.stringify(item.productDimensions), item.productDimensions] as const] : [])).values()];
    const identifiers = observations.flatMap((item) => (item.officialIdentifiers ?? []).flatMap((identifier) => {
      const normalizedValue = normalizeProductIdentifier(identifier.type as ProductIdentifierTypeValue, identifier.rawValue);
      return normalizedValue ? [{ ...identifier, normalizedValue, market: item.market, sourceUrl: item.sourceUrl }] : [];
    }));
    return {
      reference,
      status: existingReferences.has(reference) ? "COLLISION_LOCAL_REFERENCE" as const : observations.length === 0 ? "NO_OFFICIAL_CONFIRMATION" as const : preferredName === null ? "MISSING_OFFICIAL_NAME" as const : "READY" as const,
      preferredName,
      releaseYear: releaseYears.length === 1 ? releaseYears[0]! : null,
      pieceCount: pieceCounts.length === 1 ? pieceCounts[0]! : null,
      figureCount: figureCounts.length === 1 ? figureCounts[0]! : null,
      weightGrams: weights.length === 1 ? weights[0]! : null,
      packageDimensions: packageDimensions.length === 1 ? packageDimensions[0]! : null,
      productDimensions: productDimensions.length === 1 ? productDimensions[0]! : null,
      observations,
      translations: names,
      identifiers,
      media: observations.flatMap((item) => (item.officialImages ?? []).map((media) => ({ ...media, market: item.market, sourceUrl: item.sourceUrl }))),
      listPrices: observations.flatMap((item) => item.officialPrice ? [{ ...item.officialPrice, market: item.market, sourceUrl: item.sourceUrl }] : []),
    };
  });
}
