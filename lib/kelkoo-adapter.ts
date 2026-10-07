import { exactReferenceInTitle } from "./pricing";

export type KelkooOfferItem = {
  offerId: string;
  title: string;
  offerUrl: string;
  codeEan?: string | null;
  brand?: string | null;
  merchantId?: string | number | null;
  merchantName?: string | null;
  price: number;
  deliveryCost?: number | null;
  totalPrice?: number | null;
  currency: string;
  availabilityStatus?: string | null;
  lastUpdateDate?: string | null;
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

type KelkooApiOffer = {
  offerId?: unknown;
  title?: unknown;
  price?: unknown;
  deliveryCost?: unknown;
  totalPrice?: unknown;
  currency?: unknown;
  availabilityStatus?: unknown;
  lastUpdateDate?: unknown;
  goUrl?: unknown;
  codeEan?: unknown;
  code?: { ean?: unknown } | null;
  brand?: { name?: unknown } | string | null;
  merchantId?: unknown;
  merchant?: { id?: unknown; name?: unknown } | null;
};

export class KelkooPublisherClient {
  constructor(
    private readonly token: string,
    private readonly country = "fr",
    private readonly request: typeof fetch = fetch,
  ) {}

  async search(reference: string, pageSize = 20): Promise<KelkooOfferItem[]> {
    const url = new URL("https://api.kelkoogroup.net/publisher/shopping/v2/search/offers");
    url.searchParams.set("country", this.country);
    url.searchParams.set("query", `PLAYMOBIL ${reference}`);
    url.searchParams.set("queryMatchStrength", "all");
    url.searchParams.set("fieldsAlias", "minimal");
    url.searchParams.set("additionalFields", "codeEan,merchantId,merchantName,deliveryCost,totalPrice,lastUpdateDate,availabilityStatus,goUrl,brandName");
    url.searchParams.set("pageSize", String(Math.min(50, Math.max(1, pageSize))));
    url.searchParams.set("sortBy", "totalPrice");
    url.searchParams.set("sortDirection", "asc");
    const response = await this.request(url, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Kelkoo HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { offers?: unknown }).offers) ? (payload as { offers: unknown[] }).offers : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const offer = row as KelkooApiOffer;
      if (typeof offer.offerId !== "string" || typeof offer.title !== "string" || typeof offer.price !== "number" || typeof offer.currency !== "string" || typeof offer.goUrl !== "string") return [];
      const brand = typeof offer.brand === "string" ? offer.brand : typeof offer.brand?.name === "string" ? offer.brand.name : null;
      const merchantId = offer.merchantId ?? offer.merchant?.id ?? null;
      const merchantName = typeof offer.merchant?.name === "string" ? offer.merchant.name : null;
      const codeEan = typeof offer.codeEan === "string" ? offer.codeEan : typeof offer.code?.ean === "string" ? offer.code.ean : null;
      return [{
        offerId: offer.offerId,
        title: offer.title,
        offerUrl: offer.goUrl,
        codeEan,
        brand,
        merchantId: typeof merchantId === "string" || typeof merchantId === "number" ? merchantId : null,
        merchantName,
        price: offer.price,
        deliveryCost: typeof offer.deliveryCost === "number" ? offer.deliveryCost : null,
        totalPrice: typeof offer.totalPrice === "number" ? offer.totalPrice : null,
        currency: offer.currency.toUpperCase(),
        availabilityStatus: typeof offer.availabilityStatus === "string" ? offer.availabilityStatus : null,
        lastUpdateDate: typeof offer.lastUpdateDate === "string" ? offer.lastUpdateDate : null,
      }];
    });
  }
}
