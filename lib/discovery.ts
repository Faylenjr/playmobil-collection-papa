import { getVariantsByIds } from "./catalogue";
import { getCollectorStatuses } from "./collector";
import { getDatabaseClient } from "./db";
import { calculatePromotion, isOfferFresh } from "./pricing";

function distinct<T>(values: T[]) {
  return [...new Set(values)];
}

export async function getReleaseWaveYears() {
  const db = await getDatabaseClient();
  const rows = await db.releaseWave.findMany({ distinct: ["releaseYear"], orderBy: { releaseYear: "desc" }, select: { releaseYear: true } });
  return rows.map((row) => row.releaseYear);
}

export async function getReleaseWaves(year?: number) {
  const db = await getDatabaseClient();
  const waves = await db.releaseWave.findMany({
    ...(year ? { where: { releaseYear: year } } : {}),
    orderBy: [{ releaseYear: "desc" }, { periodStart: "desc" }, { name: "asc" }],
    include: {
      market: { select: { code: true, name: true } },
      source: { select: { name: true } },
      items: { orderBy: { officialOrder: "asc" }, include: { product: { select: { name: true, variants: { orderBy: { canonicalKey: "asc" }, select: { id: true } } } } } },
    },
  });
  const allVariantIds = distinct(waves.flatMap((wave) => wave.items.flatMap((item) => item.product.variants.map((variant) => variant.id))));
  const representativeIds = waves.flatMap((wave) => wave.items.flatMap((item) => item.product.variants[0]?.id ? [item.product.variants[0].id] : []));
  const [variants, statuses] = await Promise.all([getVariantsByIds(representativeIds), getCollectorStatuses(allVariantIds)]);
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  return waves.map((wave) => {
    const items = wave.items.flatMap((item) => {
      const representativeId = item.product.variants[0]?.id;
      const variant = representativeId ? variantById.get(representativeId) : null;
      if (!variant) return [];
      const states = item.product.variants.map(({ id }) => statuses.get(id));
      return [{
        ...item,
        variant,
        variantCount: item.product.variants.length,
        inCollection: states.some((state) => state?.inCollection),
        inWishlist: states.some((state) => state?.inWishlist),
      }];
    });
    const owned = items.filter((item) => item.inCollection).length;
    const wanted = items.filter((item) => !item.inCollection && item.inWishlist).length;
    return { ...wave, items, owned, wanted, missing: Math.max(0, items.length - owned - wanted) };
  });
}

export async function getCollectorCategories() {
  const db = await getDatabaseClient();
  const categories = await db.collectorCategory.findMany({
    orderBy: { name: "asc" },
    include: { memberships: { select: { variantId: true } } },
  });
  const ids = distinct(categories.flatMap((category) => category.memberships.map((membership) => membership.variantId)));
  const statuses = await getCollectorStatuses(ids);
  return categories.map((category) => ({
    ...category,
    total: category.memberships.length,
    owned: category.memberships.filter(({ variantId }) => statuses.get(variantId)?.inCollection).length,
    wanted: category.memberships.filter(({ variantId }) => !statuses.get(variantId)?.inCollection && statuses.get(variantId)?.inWishlist).length,
  }));
}

export async function getCollectorCategory(slug: string) {
  const db = await getDatabaseClient();
  const category = await db.collectorCategory.findUnique({ where: { slug }, include: { memberships: { orderBy: { variantId: "asc" }, select: { variantId: true, evidence: true, sourceUrl: true } } } });
  if (!category) return null;
  const ids = category.memberships.map((membership) => membership.variantId);
  const [variants, statuses] = await Promise.all([getVariantsByIds(ids), getCollectorStatuses(ids)]);
  return { ...category, variants, statuses, evidence: new Map(category.memberships.map((membership) => [membership.variantId, membership])) };
}

export async function getMarketsOverview() {
  const db = await getDatabaseClient();
  const markets = await db.market.findMany({
    where: { evidence: { some: {} } },
    orderBy: { name: "asc" },
    include: { evidence: { select: { variantId: true, kind: true } } },
  });
  const ids = distinct(markets.flatMap((market) => market.evidence.map((evidence) => evidence.variantId)));
  const statuses = await getCollectorStatuses(ids);
  return markets.map((market) => {
    const variantIds = distinct(market.evidence.map((item) => item.variantId));
    return {
      id: market.id, code: market.code, name: market.name,
      total: variantIds.length,
      exclusive: distinct(market.evidence.filter((item) => item.kind === "ATTESTED_EXCLUSIVE").map((item) => item.variantId)).length,
      editions: distinct(market.evidence.filter((item) => item.kind === "MARKET_EDITION").map((item) => item.variantId)).length,
      presence: distinct(market.evidence.filter((item) => item.kind === "PRESENCE").map((item) => item.variantId)).length,
      owned: variantIds.filter((id) => statuses.get(id)?.inCollection).length,
      wanted: variantIds.filter((id) => !statuses.get(id)?.inCollection && statuses.get(id)?.inWishlist).length,
    };
  }).filter((market) => market.total > 0).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
}

export async function getMarket(code: string) {
  const db = await getDatabaseClient();
  const market = await db.market.findUnique({
    where: { code },
    include: { evidence: { orderBy: [{ kind: "asc" }, { variantId: "asc" }], select: { variantId: true, kind: true, evidence: true, sourceUrl: true } } },
  });
  if (!market) return null;
  const ids = distinct(market.evidence.map((item) => item.variantId));
  const [variants, statuses, commercialEvidence] = await Promise.all([
    getVariantsByIds(ids),
    getCollectorStatuses(ids),
    db.commercialContextEvidence.findMany({
      where: { variantId: { in: ids } },
      orderBy: [{ context: { kind: "asc" } }, { context: { canonicalName: "asc" } }, { variantId: "asc" }],
      select: { variantId: true, rawValue: true, sourceUrl: true, reason: true, context: { select: { kind: true, canonicalName: true } } },
    }),
  ]);
  const evidenceByKey = new Map(market.evidence.map((item) => [`${item.variantId}:${item.kind}`, item]));
  const commercialByVariant = new Map<string, typeof commercialEvidence>();
  for (const item of commercialEvidence) {
    const current = commercialByVariant.get(item.variantId) ?? [];
    current.push(item);
    commercialByVariant.set(item.variantId, current);
  }
  const contextGroups = [...commercialEvidence.reduce((groups, item) => {
    const key = `${item.context.kind}:${item.context.canonicalName}`;
    const group = groups.get(key) ?? { kind: item.context.kind, name: item.context.canonicalName, variantIds: new Set<string>() };
    group.variantIds.add(item.variantId);
    groups.set(key, group);
    return groups;
  }, new Map<string, { kind: typeof commercialEvidence[number]["context"]["kind"]; name: string; variantIds: Set<string> }>()).values()]
    .map((group) => ({ kind: group.kind, name: group.name, variants: group.variantIds.size }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || right.variants - left.variants || left.name.localeCompare(right.name, "fr"));
  return { ...market, variants, statuses, evidenceByKey, commercialEvidence, commercialByVariant, contextGroups };
}

export async function getVariantPriceSummary(variantId: string) {
  const db = await getDatabaseClient();
  const [allListPrices, offers, koupobolCandidate] = await Promise.all([
    db.listPriceObservation.findMany({ where: { variantId }, orderBy: { observedAt: "desc" }, include: { market: true, source: true }, take: 50 }),
    db.offer.findMany({
      where: { OR: [{ variantId }, { product: { variants: { some: { id: variantId } } } }] },
      orderBy: { lastObservedAt: "desc" },
      include: { retailer: { include: { market: true } }, observations: { orderBy: { observedAt: "desc" }, take: 1 } },
      take: 20,
    }),
    db.externalCandidate.findFirst({
      where: { importedProduct: { variants: { some: { id: variantId } } } },
      select: { observations: { where: { source: { key: "koupobol-discovery" } }, orderBy: { lastObservedAt: "desc" }, take: 1, select: { sourceUrl: true } } },
    }),
  ]);
  const seenMarkets = new Set<string>();
  const listPrices = allListPrices.filter((price) => {
    if (seenMarkets.has(price.marketId)) return false;
    seenMarkets.add(price.marketId);
    return true;
  });
  return { listPrices, offers, koupobolUrl: koupobolCandidate?.observations[0]?.sourceUrl ?? null };
}

export async function getVariantPriceHighlights(variantIds: readonly string[], now = new Date()) {
  if (!variantIds.length) return new Map<string, { bestNew: null; bestUsed: null; listPrices: never[] }>();
  const db = await getDatabaseClient();
  const variants = await db.productVariant.findMany({ where: { id: { in: [...variantIds] } }, select: { id: true, productId: true } });
  const productIds = distinct(variants.map((variant) => variant.productId));
  const [offers, listPrices] = await Promise.all([
    db.offer.findMany({
      where: { availability: "AVAILABLE", OR: [{ variantId: { in: [...variantIds] } }, { productId: { in: productIds } }] },
      include: { retailer: { include: { market: true } }, observations: { orderBy: { observedAt: "desc" }, take: 1 } },
      take: 1_000,
    }),
    db.listPriceObservation.findMany({ where: { variantId: { in: [...variantIds] } }, orderBy: { observedAt: "desc" }, include: { market: true, source: true } }),
  ]);
  const latestListPrices = new Map<string, typeof listPrices>();
  for (const price of listPrices) {
    const key = `${price.variantId}:${price.marketId}`;
    if (!latestListPrices.has(key)) latestListPrices.set(key, [price]);
  }
  const total = (offer: typeof offers[number]) => {
    const latest = offer.observations[0];
    return latest ? Number(latest.totalPrice ?? latest.itemPrice) : Number.POSITIVE_INFINITY;
  };
  const result = new Map<string, { bestNew: (typeof offers[number] & { promotion: number | null }) | null; bestUsed: typeof offers[number] | null; listPrices: typeof listPrices }>();
  for (const variant of variants) {
    const prices = [...latestListPrices.entries()].filter(([key]) => key.startsWith(`${variant.id}:`)).flatMap(([, value]) => value);
    const matching = offers.filter((offer) => (offer.variantId === variant.id || offer.productId === variant.productId) && offer.observations[0] && isOfferFresh(offer.lastObservedAt, now));
    const newOffers = matching.filter((offer) => offer.condition === "NEW" || offer.condition === "SEALED").sort((left, right) => total(left) - total(right));
    const usedOffers = matching.filter((offer) => offer.condition === "USED").sort((left, right) => total(left) - total(right));
    const best = newOffers[0] ?? null;
    const latest = best?.observations[0];
    const listPrice = best?.retailer.marketId && latest ? prices.find((price) => price.marketId === best.retailer.marketId && price.currency === latest.currency) : null;
    const promotion = best && latest && listPrice ? calculatePromotion({ condition: best.condition, currentPrice: Number(latest.itemPrice), currentCurrency: latest.currency, currentMarket: best.retailer.market?.code ?? null, listPrice: Number(listPrice.amount), listCurrency: listPrice.currency, listMarket: listPrice.market.code, observedAt: latest.observedAt, now }) : null;
    result.set(variant.id, { bestNew: best ? { ...best, promotion } : null, bestUsed: usedOffers[0] ?? null, listPrices: prices });
  }
  return result;
}

export async function getFreshDeals(now = new Date()) {
  const db = await getDatabaseClient();
  const freshSince = new Date(now.getTime() - 24 * 3_600_000);
  const rows = await db.offer.findMany({
    where: { variantId: { not: null }, availability: "AVAILABLE", condition: { in: ["NEW", "SEALED"] }, lastObservedAt: { gte: freshSince } },
    orderBy: { lastObservedAt: "desc" },
    select: { variantId: true },
    take: 1_000,
  });
  const ids = distinct(rows.flatMap((row) => row.variantId ? [row.variantId] : []));
  const [variants, highlights, statuses] = await Promise.all([getVariantsByIds(ids), getVariantPriceHighlights(ids, now), getCollectorStatuses(ids)]);
  return variants.flatMap((variant) => {
    const pricing = highlights.get(variant.id);
    if (!pricing?.bestNew || pricing.bestNew.promotion === null || pricing.bestNew.promotion <= 0) return [];
    return [{ variant, pricing, status: statuses.get(variant.id) }];
  }).sort((left, right) => {
    const leftObservation = left.pricing.bestNew?.observations[0];
    const rightObservation = right.pricing.bestNew?.observations[0];
    const leftTotal = leftObservation ? Number(leftObservation.totalPrice ?? leftObservation.itemPrice) : Number.POSITIVE_INFINITY;
    const rightTotal = rightObservation ? Number(rightObservation.totalPrice ?? rightObservation.itemPrice) : Number.POSITIVE_INFINITY;
    return leftTotal - rightTotal || (right.pricing.bestNew?.promotion ?? 0) - (left.pricing.bestNew?.promotion ?? 0);
  });
}
