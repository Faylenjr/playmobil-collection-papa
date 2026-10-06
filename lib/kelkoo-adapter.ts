import { exactReferenceInTitle } from "./pricing";

export type KelkooOfferItem = {
  offerId: string;
  title: string;
  offerUrl: string;
  codeEan?: string | null;
  brand?: string | null;
  price: number;
  currency: string;
};

export function matchKelkooOffer(item: KelkooOfferItem, input: { reference: string; eans: readonly string[] }) {
  const normalizedEan = item.codeEan?.replace(/\D/g, "") ?? null;
  if (normalizedEan && input.eans.includes(normalizedEan)) return { accepted: true, confidence: 1, reason: "EAN exact" };
  const playmobilBrand = item.brand?.trim().toUpperCase() === "PLAYMOBIL";
  if (playmobilBrand && exactReferenceInTitle(item.title, input.reference)) return { accepted: true, confidence: 0.95, reason: "Référence commerciale exacte et marque PLAYMOBIL" };
  return { accepted: false, confidence: 0, reason: "Ni EAN exact ni couple référence exacte + marque PLAYMOBIL" };
}

export function kelkooAdapterConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const token = environment.KELKOO_PUBLISHER_TOKEN?.trim();
  return { enabled: Boolean(token), country: environment.KELKOO_COUNTRY?.trim().toLowerCase() || "fr" };
}
