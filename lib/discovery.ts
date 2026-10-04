import { getVariantsByIds } from "./catalogue";
import { getCollectorStatuses } from "./collector";
import { getDatabaseClient } from "./db";

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
  const [variants, statuses] = await Promise.all([getVariantsByIds(ids), getCollectorStatuses(ids)]);
  const evidenceByKey = new Map(market.evidence.map((item) => [`${item.variantId}:${item.kind}`, item]));
  return { ...market, variants, statuses, evidenceByKey };
}

export async function getVariantPriceSummary(variantId: string) {
  const db = await getDatabaseClient();
  const [listPrices, offers] = await Promise.all([
    db.listPriceObservation.findMany({ where: { variantId }, orderBy: { observedAt: "desc" }, include: { market: true, source: true }, take: 12 }),
    db.offer.findMany({
      where: { OR: [{ variantId }, { product: { variants: { some: { id: variantId } } } }] },
      orderBy: { lastObservedAt: "desc" },
      include: { retailer: true, observations: { orderBy: { observedAt: "desc" }, take: 1 } },
      take: 20,
    }),
  ]);
  return { listPrices, offers };
}
