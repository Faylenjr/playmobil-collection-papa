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
): Promise<OfferCandidate[]> {
  const items = await client.search(`PLAYMOBIL ${reference}`, marketplaceId);
  return items.map((item) => ({ item, ...matchEbayItem(item, reference) }));
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
