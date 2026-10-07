import "dotenv/config";
import { getNodeDatabaseClient } from "../lib/db-node";
import { EbayApiClient, ebayAdapterConfiguration, findEbayOfferCandidates } from "../lib/ebay-adapter";
import { KelkooPublisherClient, kelkooAdapterConfiguration, matchKelkooOffer } from "../lib/kelkoo-adapter";
import { persistOfferRefresh, type NormalizedCommerceOffer } from "../lib/offer-refresh";
import { normalizeEbayCondition } from "../lib/pricing";
import { classifyCollectorReference } from "../lib/collector-reference";

const providerName = process.argv.find((value) => value === "kelkoo" || value === "ebay");
const apply = process.argv.includes("--apply");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = Math.min(100, Math.max(1, Number.parseInt(limitArg?.split("=")[1] ?? "20", 10) || 20));

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function targets(db: ReturnType<typeof getNodeDatabaseClient>) {
  const candidates = await db.productVariant.findMany({
    where: {
      OR: [{ releaseYear: 2026 }, { releaseYear: null, product: { releaseYear: 2026 } }],
      references: { some: { identityClass: "ASSIGNED" } },
    },
    orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { canonicalKey: "asc" }],
    take: Math.min(500, limit * 20),
    select: {
      id: true,
      productId: true,
      references: { where: { isPrimary: true }, take: 1, select: { baseValue: true, normalizedValue: true, displayValue: true } },
      identifiers: { where: { type: { in: ["EAN", "GTIN"] } }, select: { normalizedValue: true } },
      product: { select: {
        kind: true,
        identifiers: { where: { type: { in: ["EAN", "GTIN"] } }, select: { normalizedValue: true } },
      } },
    },
  });

  return candidates.filter((candidate) => {
    const reference = candidate.references[0];
    if (!reference) return false;
    return classifyCollectorReference({
      ...reference,
      identityClass: "ASSIGNED",
      suffix: null,
      productKind: candidate.product.kind,
      format: null,
    }) === "COMMERCIAL";
  }).slice(0, limit);
}

async function refreshKelkoo(db: ReturnType<typeof getNodeDatabaseClient>) {
  const configuration = kelkooAdapterConfiguration();
  if (!configuration.enabled || !process.env.KELKOO_PUBLISHER_TOKEN) return { blocked: "KELKOO_PUBLISHER_TOKEN absent" };
  if (configuration.country !== "fr") return { blocked: `Pays Kelkoo refusé pour cette phase: ${configuration.country}` };
  const client = new KelkooPublisherClient(process.env.KELKOO_PUBLISHER_TOKEN, configuration.country);
  const selected = await targets(db);
  const offers: NormalizedCommerceOffer[] = [];
  const rejected: Array<{ reference: string; offerId: string; reason: string }> = [];
  const errors: Array<{ reference: string; error: string }> = [];
  const successfulTargets: string[] = [];
  let received = 0;
  for (const target of selected) {
    const reference = target.references[0]?.baseValue ?? target.references[0]?.normalizedValue ?? target.references[0]?.displayValue;
    if (!reference) continue;
    try {
      const rows = await client.search(reference);
      received += rows.length;
      successfulTargets.push(target.id);
      const eans = [...target.identifiers, ...target.product.identifiers].map((item) => item.normalizedValue);
      for (const row of rows) {
        const match = matchKelkooOffer(row, { reference, eans });
        if (!match.accepted) { rejected.push({ reference, offerId: row.offerId, reason: match.reason }); continue; }
        if (row.currency !== "EUR") { rejected.push({ reference, offerId: row.offerId, reason: `Devise ${row.currency} hors périmètre FR` }); continue; }
        const merchantId = String(row.merchantId ?? "unknown");
        const merchantName = row.merchantName?.trim() || `Marchand Kelkoo ${merchantId}`;
        offers.push({
          variantId: target.id,
          retailerKey: `kelkoo-fr-${slug(merchantId)}`,
          retailerName: merchantName,
          retailerBaseUrl: "https://www.kelkoo.fr",
          retailerType: "SHOP",
          countryCode: "FR",
          marketCode: "FRANCE",
          externalId: row.offerId,
          url: row.offerUrl,
          condition: "NEW",
          availability: ["in_stock", "pre_order", "available_on_order", "stock_on_order"].includes(row.availabilityStatus ?? "") ? "AVAILABLE" : ["not_in_stock", "out_of_stock"].includes(row.availabilityStatus ?? "") ? "OUT_OF_STOCK" : "UNKNOWN",
          matchConfidence: match.confidence,
          matchEvidence: match.reason,
          itemPrice: row.price,
          shippingPrice: row.deliveryCost ?? (row.totalPrice !== null && row.totalPrice !== undefined ? Math.max(0, row.totalPrice - row.price) : null),
          currency: row.currency,
          observedAt: new Date(),
        });
      }
    } catch (error) { errors.push({ reference, error: error instanceof Error ? error.message : String(error) }); }
  }
  const report = { provider: "kelkoo", mode: apply ? "APPLY" : "DRY_RUN", targets: selected.length, successfulTargets: successfulTargets.length, received, accepted: offers.length, rejected: rejected.length, errors };
  if (!apply) return { ...report, rejectedSamples: rejected.slice(0, 20) };
  if (errors.length || received === 0 || offers.length === 0) return { ...report, blocked: "Écriture refusée: échantillon vide, aucun match accepté ou erreur fournisseur" };
  return { ...report, persistence: await persistOfferRefresh(db, { sourceKey: "kelkoo-publisher", sourceName: "Kelkoo Publisher France", sourceBaseUrl: "https://www.kelkoo.fr", sourceTermsUrl: "https://docs.kelkoogroup.com/for-publishers" }, successfulTargets, offers) };
}

async function refreshEbay(db: ReturnType<typeof getNodeDatabaseClient>) {
  const configuration = ebayAdapterConfiguration();
  if (!configuration.enabled || !process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) return { blocked: "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET absents" };
  if (configuration.marketplaceId !== "EBAY_FR") return { blocked: `Marketplace refusée pour cette phase: ${configuration.marketplaceId}` };
  const client = new EbayApiClient(process.env.EBAY_CLIENT_ID, process.env.EBAY_CLIENT_SECRET, configuration.environment);
  const selected = await targets(db);
  const offers: NormalizedCommerceOffer[] = [];
  const rejected: Array<{ reference: string; offerId: string; reason: string }> = [];
  const errors: Array<{ reference: string; error: string }> = [];
  const acceptedSamples: Array<{ reference: string; offerId: string; title: string; reason: string; price: string | null; condition: string | null }> = [];
  const successfulTargets: string[] = [];
  let received = 0;
  for (const target of selected) {
    const reference = target.references[0]?.baseValue ?? target.references[0]?.normalizedValue ?? target.references[0]?.displayValue;
    if (!reference) continue;
    try {
      const eans = [...target.identifiers, ...target.product.identifiers].map((item) => item.normalizedValue);
      const candidates = await findEbayOfferCandidates(client, reference, configuration.marketplaceId, eans);
      received += candidates.length;
      successfulTargets.push(target.id);
      for (const candidate of candidates) {
        const row = candidate.item;
        if (!candidate.accepted) { rejected.push({ reference, offerId: row.itemId, reason: candidate.reason }); continue; }
        const price = Number(row.price?.value);
        if (!Number.isFinite(price) || price < 0 || row.price?.currency !== "EUR") { rejected.push({ reference, offerId: row.itemId, reason: "Prix EUR valide absent" }); continue; }
        const shipping = row.shippingPrice === undefined ? null : Number(row.shippingPrice);
        acceptedSamples.push({
          reference,
          offerId: row.itemId,
          title: row.title,
          reason: candidate.reason,
          price: row.price?.value ?? null,
          condition: row.condition ?? null,
        });
        offers.push({
          variantId: target.id,
          retailerKey: "ebay-fr",
          retailerName: "eBay France",
          retailerBaseUrl: "https://www.ebay.fr",
          retailerType: "MARKETPLACE",
          countryCode: "FR",
          marketCode: "FRANCE",
          externalId: row.itemId,
          url: row.itemWebUrl,
          condition: normalizeEbayCondition(row.condition),
          availability: "AVAILABLE",
          matchConfidence: candidate.confidence,
          matchEvidence: candidate.reason,
          itemPrice: price,
          shippingPrice: shipping !== null && Number.isFinite(shipping) && shipping >= 0 ? shipping : null,
          currency: "EUR",
          observedAt: new Date(),
        });
      }
    } catch (error) { errors.push({ reference, error: error instanceof Error ? error.message : String(error) }); }
  }
  const report = { provider: "ebay", mode: apply ? "APPLY" : "DRY_RUN", targets: selected.length, successfulTargets: successfulTargets.length, received, accepted: offers.length, rejected: rejected.length, errors };
  if (!apply) return { ...report, acceptedSamples: acceptedSamples.slice(0, 20), rejectedSamples: rejected.slice(0, 20) };
  if (errors.length || received === 0 || offers.length === 0) return { ...report, blocked: "Écriture refusée: échantillon vide, aucun match accepté ou erreur fournisseur" };
  return { ...report, persistence: await persistOfferRefresh(db, { sourceKey: "ebay-browse", sourceName: "eBay Browse API", sourceBaseUrl: "https://www.ebay.fr", sourceTermsUrl: "https://developer.ebay.com/develop/api/buy/browse_api" }, successfulTargets, offers) };
}

async function main() {
  if (!providerName) throw new Error("Provider requis: kelkoo ou ebay");
  const db = getNodeDatabaseClient();
  try { console.log(JSON.stringify(providerName === "kelkoo" ? await refreshKelkoo(db) : await refreshEbay(db), null, 2)); }
  finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
