import { matchEbayItem, type EbaySearchItem } from "./pricing";

export interface EbayBrowseClient {
  search(query: string, marketplaceId: string): Promise<readonly EbaySearchItem[]>;
}

export interface OfferCandidate {
  item: EbaySearchItem;
  accepted: boolean;
  confidence: number;
  reason: string;
}

/**
 * The adapter deliberately returns reviewable candidates. A keyword response
 * is never persisted as an Offer until the exact commercial reference is
 * isolated in the title (and future structured checks can raise confidence).
 */
export async function findEbayOfferCandidates(
  client: EbayBrowseClient,
  reference: string,
  marketplaceId = "EBAY_FR",
  eans: readonly string[] = [],
): Promise<OfferCandidate[]> {
  const items = await client.search(`PLAYMOBIL ${reference}`, marketplaceId);
  return items.map((item) => ({ item, ...matchEbayItem(item, reference, eans) }));
}

export function ebayAdapterConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const clientId = environment.EBAY_CLIENT_ID?.trim();
  const clientSecret = environment.EBAY_CLIENT_SECRET?.trim();
  return {
    enabled: Boolean(clientId && clientSecret),
    environment: environment.EBAY_ENVIRONMENT === "production" ? "production" as const : "sandbox" as const,
    marketplaceId: environment.EBAY_MARKETPLACE_ID?.trim() || "EBAY_FR",
  };
}

type EbayTokenResponse = { access_token?: unknown; expires_in?: unknown };
type EbaySearchResponse = { itemSummaries?: unknown[] };

export class EbayApiClient implements EbayBrowseClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly environment: "sandbox" | "production" = "production",
    private readonly request: typeof fetch = fetch,
  ) {}

  private get apiBase() { return this.environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com"; }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await this.request(`${this.apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    });
    if (!response.ok) throw new Error(`eBay OAuth HTTP ${response.status}`);
    const payload = await response.json() as EbayTokenResponse;
    if (typeof payload.access_token !== "string") throw new Error("eBay OAuth response has no access token");
    const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 7_200;
    this.token = { value: payload.access_token, expiresAt: Date.now() + expiresIn * 1_000 };
    return this.token.value;
  }

  async search(query: string, marketplaceId: string): Promise<readonly EbaySearchItem[]> {
    const token = await this.accessToken();
    const url = new URL(`${this.apiBase}/buy/browse/v1/item_summary/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "50");
    const response = await this.request(url, { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": marketplaceId, Accept: "application/json" } });
    if (!response.ok) throw new Error(`eBay Browse HTTP ${response.status}`);
    const payload = await response.json() as EbaySearchResponse;
    return (payload.itemSummaries ?? []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      if (typeof item.itemId !== "string" || typeof item.title !== "string" || typeof item.itemWebUrl !== "string") return [];
      const price = item.price && typeof item.price === "object" ? item.price as Record<string, unknown> : null;
      const shippingOptions = Array.isArray(item.shippingOptions) ? item.shippingOptions : [];
      const shipping = shippingOptions[0] && typeof shippingOptions[0] === "object" ? shippingOptions[0] as Record<string, unknown> : null;
      const shippingCost = shipping?.shippingCost && typeof shipping.shippingCost === "object" ? shipping.shippingCost as Record<string, unknown> : null;
      return [{
        itemId: item.itemId,
        title: item.title,
        itemWebUrl: item.itemWebUrl,
        ...(typeof item.condition === "string" ? { condition: item.condition } : {}),
        ...(typeof item.gtin === "string" || Array.isArray(item.gtin) ? { gtin: item.gtin as string | string[] } : {}),
        ...(price && typeof price.value === "string" && typeof price.currency === "string" ? { price: { value: price.value, currency: price.currency } } : {}),
        ...(shippingCost && typeof shippingCost.value === "string" ? { shippingPrice: shippingCost.value } : {}),
      }];
    });
  }
}
