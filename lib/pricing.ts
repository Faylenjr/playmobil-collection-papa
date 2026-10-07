const allowedOfferHosts = new Set(["ebay.fr", "www.ebay.fr", "ebay.de", "www.ebay.de", "leboncoin.fr", "www.leboncoin.fr", "dealabs.com", "www.dealabs.com", "kelkoo.fr", "www.kelkoo.fr", "fr-go.kelkoogroup.net", "koupobol.com", "www.koupobol.com"]);

export function safeExternalOfferUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedOfferHosts.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function marketplaceSearchLinks(reference: string) {
  const query = encodeURIComponent(`PLAYMOBIL ${reference}`);
  return {
    ebay: `https://www.ebay.fr/sch/i.html?_nkw=${query}`,
    leboncoin: `https://www.leboncoin.fr/recherche?text=${query}`,
    dealabs: `https://www.dealabs.com/search?q=${query}`,
  };
}

export function exactReferenceInTitle(title: string, reference: string) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9A-Z])${escaped}([^0-9A-Z]|$)`, "i").test(title);
}

export function calculatePromotion(input: {
  condition: "NEW" | "USED" | "SEALED" | "UNKNOWN";
  currentPrice: number;
  currentCurrency: string;
  currentMarket: string | null;
  listPrice: number;
  listCurrency: string;
  listMarket: string | null;
  observedAt: Date;
  now?: Date;
  maxAgeHours?: number;
}) {
  if (!["NEW", "SEALED"].includes(input.condition) || input.currentPrice < 0 || input.listPrice <= 0) return null;
  if (input.currentCurrency !== input.listCurrency || input.currentMarket !== input.listMarket) return null;
  const ageMs = (input.now ?? new Date()).getTime() - input.observedAt.getTime();
  if (ageMs > (input.maxAgeHours ?? 24) * 3_600_000 || ageMs < 0) return null;
  return Math.max(0, (input.listPrice - input.currentPrice) / input.listPrice);
}

export type EbaySearchItem = { itemId: string; title: string; itemWebUrl: string; price?: { value: string; currency: string }; shippingPrice?: string; condition?: string; conditionId?: string; gtin?: string | readonly string[] };

export function isOfferFresh(lastObservedAt: Date, now = new Date(), maxAgeHours = 24) {
  const age = now.getTime() - lastObservedAt.getTime();
  return age >= 0 && age <= maxAgeHours * 3_600_000;
}

export function deliveryEstimateLabel(country: string, postalCode?: string | null) {
  const normalizedCountry = country.trim().toUpperCase();
  const normalizedPostalCode = postalCode?.replace(/\s+/g, "").toUpperCase() ?? "";
  if (normalizedCountry === "FR" && /^\d{5}$/.test(normalizedPostalCode)) return `Livraison estimée pour ${normalizedPostalCode.slice(0, 2)}xxx`;
  const countryName = normalizedCountry === "FR" ? "la France" : normalizedCountry === "DE" ? "l’Allemagne" : normalizedCountry;
  return `Livraison estimée pour ${countryName}`;
}

export function relativeRefreshLabel(observedAt: Date, now = new Date()) {
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Actualisé à l’instant";
  if (elapsedMinutes < 60) return `Actualisé il y a ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Actualisé il y a ${elapsedHours} h`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `Actualisé il y a ${elapsedDays} j`;
}

export type OfficialPriceFact = {
  amount: number;
  currency: string;
  observedAt: Date;
  validUntil?: Date | null;
};

export function latestOfficialPrice<T extends OfficialPriceFact>(prices: readonly T[]) {
  const latest = [...prices].sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0] ?? null;
  return latest ? { price: latest, status: latest.validUntil ? "LAST_KNOWN" as const : "CURRENT" as const } : null;
}

export function priceDrop(observations: readonly { itemPrice: number; observedAt: Date }[]) {
  const ordered = [...observations].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  if (ordered.length < 2) return null;
  const previous = ordered.at(-2)!;
  const current = ordered.at(-1)!;
  const amount = previous.itemPrice - current.itemPrice;
  if (amount <= 0 || previous.itemPrice <= 0) return null;
  return { previous: previous.itemPrice, current: current.itemPrice, amount, percentage: amount / previous.itemPrice };
}

export function priceHistoryStats(observations: readonly { itemPrice: number; totalPrice?: number | null; observedAt: Date }[]) {
  if (!observations.length) return null;
  const ordered = [...observations].sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime());
  const totals = ordered.map((item) => item.totalPrice ?? item.itemPrice);
  return {
    current: totals.at(-1)!,
    lowest: Math.min(...totals),
    highest: Math.max(...totals),
    firstObservedAt: ordered[0]!.observedAt,
    lastObservedAt: ordered.at(-1)!.observedAt,
    drop: priceDrop(ordered),
  };
}

export function normalizeEbayCondition(value: string | undefined, conditionId?: string): "NEW" | "USED" | "UNKNOWN" {
  if (["1000", "1500"].includes(conditionId ?? "")) return "NEW";
  if (["2000", "2500", "2750", "3000", "4000", "5000", "6000", "7000"].includes(conditionId ?? "")) return "USED";
  const normalized = value?.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "_") ?? "";
  if (["NEW", "NEUF", "NEU"].includes(normalized)) return "NEW";
  if (normalized.includes("USED") || normalized.includes("OCCASION") || normalized.includes("GEBRAUCHT") || normalized.includes("PRE_OWNED") || normalized.includes("PREOWNED")) return "USED";
  return "UNKNOWN";
}

export function matchEbayItem(item: EbaySearchItem, reference: string, eans: readonly string[] = []) {
  const observedGtins = (Array.isArray(item.gtin) ? item.gtin : item.gtin ? [item.gtin] : []).map((value) => value.replace(/\D/g, ""));
  if (observedGtins.some((value) => eans.includes(value))) return { accepted: true, confidence: 1, reason: "EAN/GTIN exact fourni par eBay" };
  const exact = /\bPLAYMOBIL\b/i.test(item.title) && exactReferenceInTitle(item.title, reference);
  return {
    accepted: exact,
    confidence: exact ? 0.95 : 0,
    reason: exact ? "Marque PLAYMOBIL et référence exacte isolées dans le titre eBay" : "Marque ou référence exacte absente",
  };
}
