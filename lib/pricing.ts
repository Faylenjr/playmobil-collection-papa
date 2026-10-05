const allowedOfferHosts = new Set(["ebay.fr", "www.ebay.fr", "leboncoin.fr", "www.leboncoin.fr", "dealabs.com", "www.dealabs.com", "kelkoo.fr", "www.kelkoo.fr"]);

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
  if (input.condition === "USED" || input.currentPrice < 0 || input.listPrice <= 0) return null;
  if (input.currentCurrency !== input.listCurrency || input.currentMarket !== input.listMarket) return null;
  const ageMs = (input.now ?? new Date()).getTime() - input.observedAt.getTime();
  if (ageMs > (input.maxAgeHours ?? 24) * 3_600_000 || ageMs < 0) return null;
  return Math.max(0, (input.listPrice - input.currentPrice) / input.listPrice);
}

export type EbaySearchItem = { itemId: string; title: string; itemWebUrl: string; price?: { value: string; currency: string }; condition?: string };

export function matchEbayItem(item: EbaySearchItem, reference: string) {
  const exact = exactReferenceInTitle(item.title, reference);
  return {
    accepted: exact,
    confidence: exact ? 0.95 : 0,
    reason: exact ? "Référence exacte isolée dans le titre eBay" : "Référence absente ou seulement partielle",
  };
}
