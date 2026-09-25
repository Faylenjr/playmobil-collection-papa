import "dotenv/config";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { getDatabaseClient } from "../lib/db";
import { parseOfficialPageObservation, type OfficialMarket, type OfficialPageObservation } from "../lib/official-source-audit";
import {
  decideOfficialWaveMatch, official2026ManifestDigest, official2026References, official2026ReleaseWaves,
  parseOfficialWavePage, type OfficialWaveMatchDecision,
} from "../lib/official-release-waves";
import { collectorClassFromFactsSql, collectorFactsCtesSql, collectorFactsJoinsSql, type CollectorClass } from "../lib/ranking";
import { PoliteHttpClient } from "../src/importers/http";

type LocalRow = {
  officialReference: string;
  variantId: string;
  productId: string;
  canonicalKey: string;
  variantKind: string;
  canonicalReference: string | null;
  productBaseReference: string | null;
  identityClasses: string[];
  markets: string[];
  themes: string[];
  collectorClass: CollectorClass;
  variantFrName: string | null;
  productFrName: string | null;
  hasBoxMedia: boolean;
  owned: boolean;
  wishlist: boolean;
  figureCount: number | null;
};

const productMarkets: Record<OfficialMarket, string> = {
  "fr-FR": "https://www.playmobil.com/fr-fr",
  "de-DE": "https://www.playmobil.com/de-de",
};

const stableHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

async function readLocalRows(db: Awaited<ReturnType<typeof getDatabaseClient>>) {
  return db.$queryRaw<LocalRow[]>(Prisma.sql`
    WITH ${collectorFactsCtesSql}, target_refs("reference") AS (
      VALUES ${Prisma.join(official2026References.map((reference) => Prisma.sql`(${reference})`))}
    )
    SELECT target_refs."reference" AS "officialReference", pv."id" AS "variantId", p."id" AS "productId",
      pv."canonical_key" AS "canonicalKey", pv."variant_kind"::text AS "variantKind",
      (SELECT pr2."display_value" FROM "product_references" pr2 WHERE pr2."variant_id"=pv."id"
        ORDER BY pr2."is_primary" DESC, pr2."normalized_value" LIMIT 1) AS "canonicalReference",
      p."base_reference" AS "productBaseReference",
      ARRAY_AGG(DISTINCT matched_ref."identity_class"::text ORDER BY matched_ref."identity_class"::text) AS "identityClasses",
      ARRAY(SELECT DISTINCT m."code" FROM "variant_markets" vm JOIN "markets" m ON m."id"=vm."market_id"
        WHERE vm."variant_id"=pv."id" ORDER BY m."code") AS markets,
      ARRAY(SELECT DISTINCT t."name" FROM (
        SELECT vt."theme_id" FROM "variant_themes" vt WHERE vt."variant_id"=pv."id"
        UNION SELECT pt."theme_id" FROM "product_themes" pt WHERE pt."product_id"=p."id"
      ) linked_theme JOIN "themes" t ON t."id"=linked_theme."theme_id" ORDER BY t."name") AS themes,
      (${collectorClassFromFactsSql})::text AS "collectorClass",
      (SELECT vt."name" FROM "variant_translations" vt WHERE vt."variant_id"=pv."id" AND LOWER(vt."locale") LIKE 'fr%' AND vt."name" IS NOT NULL ORDER BY vt."locale" LIMIT 1) AS "variantFrName",
      (SELECT tr."name" FROM "translations" tr WHERE tr."product_id"=p."id" AND LOWER(tr."locale") LIKE 'fr%' AND tr."name" IS NOT NULL ORDER BY tr."locale" LIMIT 1) AS "productFrName",
      EXISTS(SELECT 1 FROM "media_assets" ma WHERE ma."variant_id"=pv."id" AND LOWER(ma."kind") IN ('box_front','box_back')) AS "hasBoxMedia",
      EXISTS(SELECT 1 FROM "collection_items" ci WHERE ci."variant_id"=pv."id") AS owned,
      EXISTS(SELECT 1 FROM "wishlist_items" wi WHERE wi."variant_id"=pv."id") AS wishlist,
      pv."figure_count" AS "figureCount"
    FROM target_refs
    JOIN "product_references" matched_ref ON matched_ref."base_value"=target_refs."reference"
    JOIN "product_variants" pv ON pv."id"=matched_ref."variant_id"
    JOIN "products" p ON p."id"=pv."product_id"
    ${collectorFactsJoinsSql}
    GROUP BY target_refs."reference", pv."id", p."id", crf."hasAssignedReference", ctf."hasBuildingTag",
      ctf."hasDirectBuildingTag", ctf."hasVehicleTag", ctf."hasStrongVehicleTag", ctf."hasAnimalTag",
      ctf."hasAccessoryTag", ctf."hasPeopleTag", cvpf."partTypes", cppf."partTypes", cif."variant_id"
    ORDER BY target_refs."reference", pv."canonical_key"
  `);
}

function decide(reference: string, rows: LocalRow[]): OfficialWaveMatchDecision {
  return decideOfficialWaveMatch(rows.filter((row) => row.officialReference === reference).map((row) => ({
    variantId: row.variantId,
    productId: row.productId,
    variantKind: row.variantKind,
    identityClasses: row.identityClasses,
  })));
}

async function fetchWavePages(client: PoliteHttpClient) {
  const results = [];
  for (const wave of official2026ReleaseWaves) {
    try {
      const response = await client.get(wave.sourceUrl);
      results.push({
        slug: wave.slug, sourceUrl: wave.sourceUrl, httpStatus: response.status, contentHash: response.hash,
        ...(response.status === 200 ? parseOfficialWavePage(response.body, wave) : { observedReferences: [], missingExpectedReferences: [...wave.references], unexpectedReferences: [] }),
      });
    } catch (error) {
      results.push({ slug: wave.slug, sourceUrl: wave.sourceUrl, httpStatus: null, error: error instanceof Error ? error.message : String(error), observedReferences: [], missingExpectedReferences: [...wave.references], unexpectedReferences: [] });
    }
  }
  return results;
}

async function fetchProductPages(client: PoliteHttpClient) {
  const results: Array<{ reference: string; observations: OfficialPageObservation[]; failures: Array<{ market: OfficialMarket; status: string }> }> = [];
  for (const reference of official2026References) {
    const observations: OfficialPageObservation[] = [];
    const failures: Array<{ market: OfficialMarket; status: string }> = [];
    for (const market of ["fr-FR", "de-DE"] as const) {
      const sourceUrl = `${productMarkets[market]}/${reference}.html`;
      try {
        const response = await client.get(sourceUrl);
        if (response.status !== 200) { failures.push({ market, status: `HTTP ${response.status}` }); continue; }
        const observation = parseOfficialPageObservation(response.body, sourceUrl, market);
        if (observation.reference !== reference) { failures.push({ market, status: `REFERENCE_MISMATCH:${observation.reference}` }); continue; }
        observations.push(observation);
      } catch (error) {
        failures.push({ market, status: error instanceof Error ? error.message : String(error) });
      }
    }
    results.push({ reference, observations, failures });
  }
  return results;
}

function fieldCoverage(products: Awaited<ReturnType<typeof fetchProductPages>>) {
  const count = (predicate: (observation: OfficialPageObservation) => boolean, market?: OfficialMarket) => products.filter((product) => product.observations.some((observation) => (!market || observation.market === market) && predicate(observation))).length;
  const fields: Record<string, (observation: OfficialPageObservation) => boolean> = {
    name: (observation) => Boolean(observation.name && observation.name !== observation.reference),
    packageDimensions: (observation) => observation.packageDimensions !== undefined,
    weight: (observation) => observation.weightGrams !== undefined,
    figureCount: (observation) => observation.figureCount !== undefined,
    boxFront: (observation) => observation.imageKinds.includes("box_front"),
    boxBack: (observation) => observation.imageKinds.includes("box_back"),
    mainImage: (observation) => observation.imageKinds.includes("main"),
  };
  return Object.fromEntries(Object.entries(fields).map(([field, predicate]) => [field, {
    any: count(predicate), fr: count(predicate, "fr-FR"), de: count(predicate, "de-DE"),
  }]));
}

function buildPlan(rows: LocalRow[], products: Awaited<ReturnType<typeof fetchProductPages>>, wavePages: Awaited<ReturnType<typeof fetchWavePages>>) {
  const productByReference = new Map(products.map((product) => [product.reference, product]));
  const itemDetails = official2026ReleaseWaves.flatMap((wave) => wave.references.map((reference, order) => {
    const localRows = rows.filter((row) => row.officialReference === reference);
    const match = decide(reference, rows);
    const official = productByReference.get(reference)!;
    return {
      wave: wave.slug, order: order + 1, reference, match,
      localVariants: localRows.map((row) => ({
        variantId: row.variantId, productId: row.productId, canonicalKey: row.canonicalKey,
        canonicalReference: row.canonicalReference, productBaseReference: row.productBaseReference,
        variantKind: row.variantKind, identityClasses: row.identityClasses, markets: row.markets, themes: row.themes,
        collectorClass: row.collectorClass, hasFrenchName: Boolean(row.variantFrName ?? row.productFrName),
        variantFrenchName: row.variantFrName, productFrenchName: row.productFrName,
        hasBoxMedia: row.hasBoxMedia, owned: row.owned, wishlist: row.wishlist, figureCount: row.figureCount,
      })),
      official: official.observations.map((observation) => ({
        market: observation.market, sourceUrl: observation.sourceUrl, name: observation.name ?? null,
        packageDimensions: observation.packageDimensions ?? null, weightGrams: observation.weightGrams ?? null,
        figureCount: observation.figureCount ?? null, imageKinds: observation.imageKinds,
      })),
      officialFailures: official.failures,
    };
  }));

  const statusCounts = Object.fromEntries(["MATCH_UNIQUE", "MATCH_PRODUCT_UNIQUE", "MATCH_MULTIPLE", "ABSENT", "BLOCKED_IDENTITY", "MARKET_VARIANT_ONLY"].map((status) => [status, itemDetails.filter((item) => item.match.status === status).length]));
  const automatic = itemDetails.filter((item) => item.match.automaticTarget);
  const conflicts = itemDetails.flatMap((item) => {
    const fr = item.official.find((observation) => observation.market === "fr-FR");
    const de = item.official.find((observation) => observation.market === "de-DE");
    const found: Array<Record<string, unknown>> = [];
    if (fr && de) {
      for (const field of ["packageDimensions", "weightGrams", "figureCount"] as const) {
        if (fr[field] !== null && de[field] !== null && !same(fr[field], de[field])) found.push({ reference: item.reference, field, kind: "OFFICIAL_MARKET_DISAGREEMENT", fr: fr[field], de: de[field] });
      }
    }
    const officialFigureCount = fr?.figureCount ?? de?.figureCount;
    if (officialFigureCount !== null && officialFigureCount !== undefined) {
      for (const variant of item.localVariants.filter((row) => row.figureCount !== null && row.figureCount !== officialFigureCount)) {
        found.push({ reference: item.reference, field: "figureCount", kind: "OFFICIAL_LOCAL_DISAGREEMENT", variantId: variant.variantId, local: variant.figureCount, official: officialFigureCount });
      }
    }
    if (fr?.name) {
      const localNames = item.match.status === "MATCH_PRODUCT_UNIQUE"
        ? [...new Set(item.localVariants.map((row) => row.productFrenchName).filter((name): name is string => Boolean(name)))]
        : [...new Set(item.localVariants.map((row) => row.variantFrenchName ?? row.productFrenchName).filter((name): name is string => Boolean(name)))];
      for (const localName of localNames.filter((name) => name !== fr.name)) {
        found.push({ reference: item.reference, field: "name.fr", kind: "OFFICIAL_LOCAL_DISAGREEMENT", target: item.match.automaticTarget, local: localName, official: fr.name });
      }
    }
    return found;
  });

  const ranges = official2026ReleaseWaves.flatMap((wave) => wave.rangeClaims.map((range) => ({ ...range, wave: wave.slug, market: wave.market, sourceUrl: wave.sourceUrl })));
  const rangeMemberships = ranges.flatMap((range) => range.references.map((reference) => {
    const item = itemDetails.find((candidate) => candidate.wave === range.wave && candidate.reference === reference)!;
    return { range: range.name, reference, matchStatus: item.match.status, automaticTarget: item.match.automaticTarget };
  }));

  const waveSummaries = official2026ReleaseWaves.map((wave) => {
    const items = itemDetails.filter((item) => item.wave === wave.slug);
    const uniqueMatches = items.filter((item) => ["MATCH_UNIQUE", "MATCH_PRODUCT_UNIQUE", "MARKET_VARIANT_ONLY"].includes(item.match.status)).length;
    const collectorClasses = [...new Set(items.flatMap((item) => item.localVariants.map((variant) => variant.collectorClass)))].sort();
    return {
      slug: wave.slug, label: wave.label, officialReferences: items.length, uniqueMatches,
      absent: items.filter((item) => item.match.status === "ABSENT").length,
      multiple: items.filter((item) => item.match.status === "MATCH_MULTIPLE").length,
      blockedIdentity: items.filter((item) => item.match.status === "BLOCKED_IDENTITY").length,
      marketVariantOnly: items.filter((item) => item.match.status === "MARKET_VARIANT_ONLY").length,
      coveragePercent: Number((uniqueMatches / items.length * 100).toFixed(2)),
      themes: [...new Set(items.flatMap((item) => item.localVariants.flatMap((variant) => variant.themes)))].sort(),
      collectorClasses: Object.fromEntries(collectorClasses.map((collectorClass) => [collectorClass, items.filter((item) => item.localVariants.some((variant) => variant.collectorClass === collectorClass)).length])),
      ownedReferences: items.filter((item) => item.localVariants.some((variant) => variant.owned)).map((item) => item.reference),
      wishlistReferences: items.filter((item) => item.localVariants.some((variant) => variant.wishlist)).map((item) => item.reference),
    };
  });

  return {
    corpus: { waves: official2026ReleaseWaves.length, references: official2026References.length, manifestDigest: official2026ManifestDigest() },
    sourceValidation: wavePages,
    waveSummaries,
    dryRun: {
      releaseWave: { wouldCreate: wavePages.filter((page) => page.httpStatus === 200 && page.missingExpectedReferences.length === 0).length, wouldReview: wavePages.filter((page) => page.httpStatus !== 200 || page.missingExpectedReferences.length > 0).length, wouldUpdate: 0 },
      releaseWaveItem: { officialReferences: itemDetails.length, uniqueMatches: automatic.length, wouldCreateAtProductLevel: automatic.length, wouldReview: itemDetails.filter((item) => !item.match.automaticTarget && item.match.status !== "ABSENT").length, absent: itemDetails.filter((item) => item.match.status === "ABSENT").length, statusCounts },
      productRange: { wouldCreate: new Set(ranges.map((range) => range.name)).size, insufficientEvidence: 2, rejectedSuggestions: ["Police: the May article identifies City Action as a play theme, not a durable Police range.", "March miscellaneous figures: the editorial grouping does not establish one shared durable range."] },
      rangeMembership: { wouldCreateAtProductLevel: rangeMemberships.filter((membership) => membership.automaticTarget).length, wouldReview: rangeMemberships.filter((membership) => !membership.automaticTarget && membership.matchStatus !== "ABSENT").length, absent: rangeMemberships.filter((membership) => membership.matchStatus === "ABSENT").length },
      officialProductEnrichment: fieldCoverage(products),
      conflicts: { wouldCreate: conflicts.length, details: conflicts },
    },
    ranges,
    rangeMemberships,
    items: itemDetails,
  };
}

async function main() {
  const db = await getDatabaseClient();
  const client = new PoliteHttpClient({ minDelayMs: Number(process.env.OFFICIAL_WAVE_DRY_RUN_DELAY_MS ?? 1500), maxRetries: 1 });
  try {
    const rows = await readLocalRows(db);
    const wavePages = await fetchWavePages(client);
    const products = await fetchProductPages(client);
    const first = buildPlan(rows, products, wavePages);
    const second = buildPlan(rows, products, wavePages);
    const firstHash = stableHash(first);
    const secondHash = stableHash(second);
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      idempotence: { firstHash, secondHash, identical: firstHash === secondHash },
      ...first,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
