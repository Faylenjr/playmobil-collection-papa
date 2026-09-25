import { createHash } from "node:crypto";
import { load } from "cheerio";

export type WavePrecision = "MONTH" | "RANGE" | "CAMPAIGN";
export type RangeKind = "LINE" | "SERIES" | "LICENSE" | "SUBLINE";

export interface OfficialRangeClaim {
  name: string;
  kind: RangeKind;
  references: readonly string[];
  confidence: "HIGH" | "MEDIUM";
  reason: string;
}

export interface OfficialReleaseWaveDefinition {
  slug: string;
  label: string;
  sourceUrl: string;
  market: "US";
  period: { start: string; end: string; precision: WavePrecision };
  references: readonly string[];
  rangeClaims: readonly OfficialRangeClaim[];
}

export const official2026ReleaseWaves = [
  {
    slug: "january-february-2026",
    label: "January and February 2026 releases",
    sourceUrl: "https://www.playmobil.com/en-us/blog/january-and-february-2026-releases.html",
    market: "US",
    period: { start: "2026-01-01", end: "2026-02-28", precision: "RANGE" },
    references: ["71634", "71720", "71838", "71839", "71843", "72011", "72012", "72013", "72014", "72027", "72028", "72043"],
    rangeClaims: [
      { name: "Funstars", kind: "SERIES", references: ["71634", "71720"], confidence: "HIGH", reason: "The official article groups both products under the PLAYMOBIL Funstars heading and links the Funstars category." },
      { name: "ESA Space Range", kind: "LINE", references: ["72011", "72012", "72013", "72014"], confidence: "HIGH", reason: "The official article explicitly calls this group the ESA Space Range." },
      { name: "Magic Unicorns", kind: "SERIES", references: ["71838", "71839", "71843"], confidence: "HIGH", reason: "The official article calls Magic Unicorns a brand-new collection and groups these products below that heading." },
      { name: "PLAYMOBIL Figures Series 29", kind: "SERIES", references: ["72027", "72028"], confidence: "HIGH", reason: "The official article explicitly identifies Boys and Girls as Series 29." },
      { name: "Monster High", kind: "LICENSE", references: ["72043"], confidence: "HIGH", reason: "The official article groups the product under Monster High x PLAYMOBIL and links the official Monster High category." },
    ],
  },
  {
    slug: "march-2026",
    label: "March 2026 releases",
    sourceUrl: "https://www.playmobil.com/en-us/blog/2026-march-releases.html",
    market: "US",
    period: { start: "2026-03-01", end: "2026-03-31", precision: "MONTH" },
    references: ["71773", "71774", "71775", "71903", "71904", "71905", "72023", "72024", "72031", "72034"],
    rangeClaims: [
      { name: "My Life", kind: "LINE", references: ["71903", "71904", "71905"], confidence: "HIGH", reason: "The official article states that the beach products are part of the My Life range." },
      { name: "PLAYMOBIL JUNIOR", kind: "LINE", references: ["71773", "71774", "71775"], confidence: "HIGH", reason: "The official article groups the three references under the PLAYMOBIL JUNIOR heading." },
    ],
  },
  {
    slug: "soccer-2026",
    label: "New Soccer Playsets for 2026",
    sourceUrl: "https://www.playmobil.com/en-us/blog/new-soccer-playsets-for-2026.html",
    market: "US",
    period: { start: "2026-01-01", end: "2026-12-31", precision: "CAMPAIGN" },
    references: ["72056", "72057", "72058"],
    rangeClaims: [
      { name: "Soccer", kind: "LINE", references: ["72056", "72057", "72058"], confidence: "HIGH", reason: "The official article calls the group the new PLAYMOBIL Soccer range and links the three products." },
    ],
  },
  {
    slug: "knights-2026",
    label: "PLAYMOBIL Knights 2026 new releases",
    sourceUrl: "https://www.playmobil.com/en-us/blog/playmobil-knights-2026-new-releases.html",
    market: "US",
    period: { start: "2026-01-01", end: "2026-12-31", precision: "CAMPAIGN" },
    references: ["72112", "72113", "72114", "72115", "72116", "72117", "72118", "72119"],
    rangeClaims: [
      { name: "Knights", kind: "LINE", references: ["72112", "72113", "72114", "72115", "72116", "72117", "72118", "72119"], confidence: "HIGH", reason: "The official campaign is explicitly devoted to the PLAYMOBIL Knights 2026 releases." },
    ],
  },
  {
    slug: "may-2026",
    label: "May 2026 releases",
    sourceUrl: "https://www.playmobil.com/en-us/blog/may-2026-releases.html",
    market: "US",
    period: { start: "2026-05-01", end: "2026-05-31", precision: "MONTH" },
    references: ["71873", "71874", "71875", "72061", "72062", "72063", "72065", "72070", "72071", "72073"],
    rangeClaims: [
      { name: "Animals & Friends", kind: "LINE", references: ["72070", "72071", "72073"], confidence: "HIGH", reason: "The official article calls these products additions to the Animals & Friends range." },
      { name: "Offroad Cars", kind: "LINE", references: ["72061", "72062", "72063", "72065"], confidence: "HIGH", reason: "The official article explicitly calls Offroad Cars a new range and groups these vehicles." },
    ],
  },
] as const satisfies readonly OfficialReleaseWaveDefinition[];

export const official2026References = [...new Set(official2026ReleaseWaves.flatMap((wave) => [...wave.references]))];

export function official2026ManifestDigest() {
  return createHash("sha256").update(JSON.stringify(official2026ReleaseWaves)).digest("hex");
}

export interface OfficialWavePageObservation {
  title?: string;
  observedReferences: string[];
  missingExpectedReferences: string[];
  unexpectedReferences: string[];
}

export function parseOfficialWavePage(html: string, wave: OfficialReleaseWaveDefinition): OfficialWavePageObservation {
  const $ = load(html);
  const article = $(".experience-region.experience-pd_shopPageSimple").first();
  const scope = article.length ? article : ($("main").first().length ? $("main").first() : $("body"));
  const title = scope.find("h1, h2").first().text().replace(/\s+/g, " ").trim() || undefined;
  const positions = new Map<string, number>();
  scope.find("a[href], img[src], h1, h2, h3, h4, p, li").each((index, element) => {
    const node = $(element);
    const evidence = `${node.text()} ${node.attr("href") ?? ""} ${node.attr("src") ?? ""}`;
    for (const match of evidence.matchAll(/(?<!\d)(7\d{4})(?!\d)/g)) {
      if (!positions.has(match[1]!)) positions.set(match[1]!, index);
    }
  });
  const observedReferences = [...positions].sort((left, right) => left[1] - right[1]).map(([reference]) => reference);
  const expected = new Set(wave.references);
  return {
    ...(title ? { title } : {}),
    observedReferences: observedReferences.filter((reference) => expected.has(reference)),
    missingExpectedReferences: wave.references.filter((reference) => !positions.has(reference)),
    unexpectedReferences: observedReferences.filter((reference) => !expected.has(reference)),
  };
}

export type OfficialWaveMatchStatus = "MATCH_UNIQUE" | "MATCH_PRODUCT_UNIQUE" | "MATCH_MULTIPLE" | "ABSENT" | "BLOCKED_IDENTITY" | "MARKET_VARIANT_ONLY";

export interface LocalWaveCandidate {
  variantId: string;
  productId: string;
  variantKind: string;
  identityClasses: readonly string[];
}

export interface OfficialWaveMatchDecision {
  status: OfficialWaveMatchStatus;
  automaticTarget: { level: "PRODUCT"; id: string } | null;
  variantIds: string[];
  productIds: string[];
}

export function decideOfficialWaveMatch(candidates: readonly LocalWaveCandidate[]): OfficialWaveMatchDecision {
  const ordered = [...candidates].sort((left, right) => left.variantId.localeCompare(right.variantId));
  const variantIds = [...new Set(ordered.map((candidate) => candidate.variantId))];
  const productIds = [...new Set(ordered.map((candidate) => candidate.productId))];
  if (!ordered.length) return { status: "ABSENT", automaticTarget: null, variantIds, productIds };
  if (ordered.some((candidate) => candidate.identityClasses.some((identityClass) => identityClass !== "ASSIGNED"))) {
    return { status: "BLOCKED_IDENTITY", automaticTarget: null, variantIds, productIds };
  }
  if (variantIds.length === 1) {
    const status = ordered[0]!.variantKind === "MARKET" ? "MARKET_VARIANT_ONLY" : "MATCH_UNIQUE";
    return { status, automaticTarget: { level: "PRODUCT", id: productIds[0]! }, variantIds, productIds };
  }
  if (productIds.length === 1) {
    return { status: "MATCH_PRODUCT_UNIQUE", automaticTarget: { level: "PRODUCT", id: productIds[0]! }, variantIds, productIds };
  }
  return { status: "MATCH_MULTIPLE", automaticTarget: null, variantIds, productIds };
}
