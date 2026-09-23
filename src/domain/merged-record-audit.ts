import { compareIdentitySignals, type IdentityRelationship, type IdentitySnapshot } from "./identity.js";

export interface MergedRecordEvidence {
  id: string;
  sourceKey: string;
  externalId: string;
  sourceUrl: string;
  contentHash: string;
  declaredReference: string | null;
  urlReferenceCandidate: string | null;
  sourceReferenceConsistent: boolean;
  names: Record<string, string>;
  name: string | null;
  releaseYear: number | null;
  themes: string[];
  format: string | null;
  productKind: string | null;
}

export interface MergedRecordRelation {
  leftRecordId: string;
  rightRecordId: string;
  relationship: IdentityRelationship;
  reason: string;
}

export type MergedVariantClassification = "MATCH" | "DISTINCT" | "AMBIGUOUS" | "SOURCE_INCONSISTENCY";

export interface MergedRecordCluster {
  id: string;
  recordIds: string[];
  relationship: "MATCH" | "SINGLETON" | "AMBIGUOUS";
}

export interface MergedVariantClusterResult {
  classification: MergedVariantClassification;
  clusters: MergedRecordCluster[];
  relations: MergedRecordRelation[];
  reason: string;
}

const normalizeText = (value: string | null | undefined) => value
  ?.normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim() || null;

const normalizeReferenceSlug = (value: string) => value
  .normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const MARKET_SEGMENTS = new Set([
  "ant", "aus", "bel", "can", "deu", "esp", "fra", "ger", "gre", "ita", "lyr", "mex", "ned", "sch", "swi", "uk", "usa",
]);

/** Extracts only a conservative leading reference candidate from a Klickypedia set slug. */
export function referenceCandidateFromSource(sourceKey: string, externalId: string, sourceUrl: string): string | null {
  if (sourceKey !== "klickypedia") return null;
  const path = (() => {
    try { return new URL(sourceUrl).pathname; }
    catch { return `/${externalId}`; }
  })();
  const match = path.match(/\/sets\/([^/]+)/i) ?? externalId.match(/(?:^|\/)sets\/([^/]+)/i);
  const slug = match?.[1]?.toLowerCase().replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const segments = slug.split("-").filter(Boolean);
  if (segments[0] === "n" && segments[1] === "a") return "N-A";
  if (!segments[0] || !/^(?:[a-z]*\d[a-z0-9.]*|\d[a-z0-9.]*)$/i.test(segments[0])) return null;

  const candidate = [segments[0]];
  let index = 1;
  while (segments[index] && /^\d+$/.test(segments[index]!)) candidate.push(segments[index++]!);
  while (segments[index] && MARKET_SEGMENTS.has(segments[index]!) && candidate.length < 5) candidate.push(segments[index++]!);
  return candidate.join("-").toUpperCase();
}

export function isSourceReferenceConsistent(declaredReference: string | null, candidate: string | null): boolean {
  if (!declaredReference || !candidate) return true;
  const declared = normalizeReferenceSlug(declaredReference);
  const observed = normalizeReferenceSlug(candidate);
  if (declared === observed) return true;
  // Klickypedia commonly appends -2/-3 to duplicate page slugs. That suffix is
  // not sufficient evidence of a different PLAYMOBIL reference.
  return new RegExp(`^${declared}-[2-9]$`).test(observed);
}

const COLORS = new Set([
  "beige", "black", "blue", "brown", "gold", "gray", "green", "grey", "orange", "pink", "purple", "red", "silver", "white", "yellow",
  "blanc", "bleu", "gris", "jaune", "noir", "orange", "rouge", "vert", "violet",
  "blau", "gelb", "gold", "grau", "grun", "orange", "rot", "schwarz", "silber", "weiss",
]);

function colorDescriptor(name: string | null): { core: string; colors: string[] } | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const words = normalized.split(" ");
  const colors = words.filter((word) => COLORS.has(word));
  if (colors.length === 0) return null;
  return { core: words.filter((word) => !COLORS.has(word)).join(" "), colors: [...new Set(colors)].sort() };
}

function routeDescriptor(name: string | null): string | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  return normalized.match(/\b(?:u|s)\s?\d+\b/)?.[0]?.replace(/\s/g, "") ?? (normalized.includes("tram") ? "tram" : null);
}

function namedDescriptor(name: string | null, marker: "cover" | "with"): { core: string; descriptor: string } | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  const parts = normalized.split(` ${marker} `);
  return parts.length === 2 && parts[0] && parts[1] ? { core: parts[0], descriptor: parts[1] } : null;
}

function numberedDescriptor(name: string | null): string | null {
  const normalized = normalizeText(name);
  return normalized?.match(/\b(?:edition|version|series|part|folge|issue|heft|nr|no)\s*\d+\b/)?.[0] ?? null;
}

function isFigureEvidence(record: MergedRecordEvidence): boolean {
  return /figure|character/i.test(`${record.productKind ?? ""} ${record.format ?? ""}`);
}

function snapshot(record: MergedRecordEvidence): IdentitySnapshot {
  return {
    id: record.id,
    name: record.name,
    releaseYear: record.releaseYear,
    themes: record.themes,
    productKind: record.productKind,
    format: record.format,
  };
}

export function compareMergedRecordEvidence(left: MergedRecordEvidence, right: MergedRecordEvidence): { relationship: IdentityRelationship; reason: string } {
  if (!left.sourceReferenceConsistent || !right.sourceReferenceConsistent) {
    return { relationship: "AMBIGUOUS", reason: "source-reference-mismatch" };
  }

  const base = compareIdentitySignals(snapshot(left), snapshot(right));
  if (base === "MATCH") return { relationship: "MATCH", reason: "aligned-name-and-secondary-signals" };

  const leftColor = colorDescriptor(left.name);
  const rightColor = colorDescriptor(right.name);
  if (leftColor && rightColor && leftColor.core === rightColor.core && leftColor.colors.join() !== rightColor.colors.join()) {
    return { relationship: "DISTINCT", reason: "explicit-color-difference" };
  }

  const leftRoute = routeDescriptor(left.name);
  const rightRoute = routeDescriptor(right.name);
  if (leftRoute && rightRoute && leftRoute !== rightRoute) return { relationship: "DISTINCT", reason: "explicit-route-difference" };

  for (const marker of ["cover", "with"] as const) {
    const leftDescriptor = namedDescriptor(left.name, marker);
    const rightDescriptor = namedDescriptor(right.name, marker);
    if (leftDescriptor && rightDescriptor && leftDescriptor.core === rightDescriptor.core && leftDescriptor.descriptor !== rightDescriptor.descriptor) {
      return { relationship: "DISTINCT", reason: `explicit-${marker}-content-difference` };
    }
  }

  const leftNumbered = numberedDescriptor(left.name);
  const rightNumbered = numberedDescriptor(right.name);
  if (leftNumbered && rightNumbered && leftNumbered !== rightNumbered) {
    return { relationship: "DISTINCT", reason: "explicit-numbered-qualifier-difference" };
  }

  const leftName = normalizeText(left.name);
  const rightName = normalizeText(right.name);
  if (leftName && rightName && leftName !== rightName && isFigureEvidence(left) && isFigureEvidence(right)) {
    return { relationship: "DISTINCT", reason: "different-figure-character-names" };
  }


  if (base === "DISTINCT") return { relationship: "DISTINCT", reason: "existing-identity-signals-distinct" };

  return { relationship: "AMBIGUOUS", reason: "insufficient-non-conflicting-signals" };
}

const compareStable = (left: MergedRecordEvidence, right: MergedRecordEvidence) => {
  const leftKey = `${left.sourceKey}\0${left.externalId}\0${left.id}`;
  const rightKey = `${right.sourceKey}\0${right.externalId}\0${right.id}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
};

/**
 * Builds MATCH connected components, then accepts them only when every member
 * is pairwise MATCH and every cross-cluster relation is DISTINCT. This avoids
 * unsafe transitive merges while remaining independent from input order.
 */
export function clusterMergedSourceRecords(input: MergedRecordEvidence[]): MergedVariantClusterResult {
  const records = [...input].sort(compareStable);
  const parent = records.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]!));
  const unite = (left: number, right: number) => {
    const a = find(left); const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const relations: MergedRecordRelation[] = [];
  const relationByPair = new Map<string, IdentityRelationship>();
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const decision = compareMergedRecordEvidence(records[left]!, records[right]!);
      relations.push({ leftRecordId: records[left]!.id, rightRecordId: records[right]!.id, ...decision });
      relationByPair.set(`${left}:${right}`, decision.relationship);
      if (decision.relationship === "MATCH") unite(left, right);
    }
  }

  const components = new Map<number, number[]>();
  records.forEach((_, index) => {
    const root = find(index);
    const values = components.get(root) ?? [];
    values.push(index);
    components.set(root, values);
  });
  const componentRows = [...components.values()].sort((left, right) => left[0]! - right[0]!);
  const hasInconsistency = records.some((record) => !record.sourceReferenceConsistent);
  const componentIsClique = componentRows.map((indices) => indices.every((left, position) => indices
    .slice(position + 1)
    .every((right) => relationByPair.get(`${Math.min(left, right)}:${Math.max(left, right)}`) === "MATCH")));
  const sameComponentIsClique = componentIsClique.every(Boolean);
  const clusters = componentRows.map((indices, index): MergedRecordCluster => ({
    id: `cluster-${index + 1}`,
    recordIds: indices.map((recordIndex) => records[recordIndex]!.id),
    relationship: indices.length === 1 ? "SINGLETON" : componentIsClique[index] ? "MATCH" : "AMBIGUOUS",
  }));
  const crossRelations = relations.filter((relation) => {
    const leftIndex = records.findIndex((record) => record.id === relation.leftRecordId);
    const rightIndex = records.findIndex((record) => record.id === relation.rightRecordId);
    return find(leftIndex) !== find(rightIndex);
  });
  const allCrossDistinct = crossRelations.every((relation) => relation.relationship === "DISTINCT");

  if (hasInconsistency) return {
    classification: "SOURCE_INCONSISTENCY", clusters, relations,
    reason: "At least one page URL/externalId suggests a different reference than the page-declared reference.",
  };
  if (clusters.length === 1 && sameComponentIsClique) return {
    classification: "MATCH", clusters, relations,
    reason: "Every SourceRecord is connected by complete, pairwise MATCH evidence.",
  };
  if (clusters.length > 1 && sameComponentIsClique && allCrossDistinct) return {
    classification: "DISTINCT", clusters, relations,
    reason: "Every proposed cluster is internally MATCH and every cross-cluster relation is DISTINCT.",
  };
  return {
    classification: "AMBIGUOUS", clusters, relations,
    reason: sameComponentIsClique
      ? "At least one cross-cluster relationship lacks sufficient evidence."
      : "MATCH transitivity produced a component that is not pairwise safe.",
  };
}
