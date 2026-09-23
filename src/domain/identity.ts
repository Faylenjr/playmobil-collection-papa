import { createHash } from "node:crypto";
import type { ParsedReference } from "./reference.js";
import type { RawCollectible } from "../importers/types.js";

export type ReferenceIdentityClass = "ASSIGNED" | "PLACEHOLDER" | "REUSED" | "AMBIGUOUS";
export type IdentityRelationship = "MATCH" | "DISTINCT" | "AMBIGUOUS";

export interface IdentitySnapshot {
  id?: string;
  productId?: string;
  productKey?: string;
  variantKey?: string;
  name: string | null;
  releaseYear: number | null;
  themes: string[];
  productKind?: string | null;
  format?: string | null;
  referenceClass?: ReferenceIdentityClass;
}

const comparable = (value: string | undefined | null) => value
  ?.normalize("NFKD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim() || null;

const tokens = (value: string) => new Set(value.split(" ").filter((token) => token.length > 1));

function tokenSimilarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return left === right ? 1 : 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

const qualifierParts = (name: string) => {
  const match = name.match(/^(.*?)\s*[([]\s*([^\])]+)\s*[)\]]\s*$/);
  return match?.[1] && match[2]
    ? { stem: comparable(match[1]), qualifier: comparable(match[2]) }
    : null;
};

const kindFamily = (kind?: string | null, format?: string | null) => {
  const signal = `${kind ?? ""} ${format ?? ""}`.toLowerCase();
  if (/catalog|catalogue|leaflet/.test(signal)) return "CATALOGUE";
  if (/magazine|comic|book/.test(signal)) return "PERIODICAL";
  if (/figure|character/.test(signal)) return "FIGURE";
  return "OTHER";
};

const issueDescriptor = (name: string) => name.match(/\b(?:heft|folge|issue|no|nr)\.?\s*\d+\b|\b\d+\/\d{4}\b/i)?.[0]?.toLowerCase() ?? null;

/**
 * Placeholder detection is intentionally anchored to the complete normalized
 * value. Legitimate references such as 0001 and 0104-SCH are never matched.
 */
export function isPlaceholderReference(value: string): boolean {
  const normalized = value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  return /^0+(?:V\d+)?(?:-[A-Z0-9-]+)?$/.test(normalized)
    || /^N\/?A(?:-[A-Z0-9-]+)?$/.test(normalized);
}

export function stableRecordQualifier(source: string, externalId: string): string {
  return createHash("sha256").update(`${source}:${externalId}`).digest("hex").slice(0, 16);
}

export function snapshotFromItem(item: RawCollectible, productKind: string): IdentitySnapshot {
  return {
    name: item.name ?? null,
    releaseYear: item.releaseYear ?? null,
    themes: item.themes ?? (item.theme ? [item.theme] : []),
    productKind,
    format: item.format ?? null,
  };
}

/**
 * Conservative three-way comparison. MATCH requires aligned positive signals;
 * DISTINCT requires more than a mere spelling difference. Everything else is
 * deliberately left AMBIGUOUS for human review.
 */
export function compareIdentitySignals(incoming: IdentitySnapshot, existing: IdentitySnapshot): IdentityRelationship {
  const incomingName = comparable(incoming.name);
  const existingName = comparable(existing.name);
  const bothNames = Boolean(incomingName && existingName);
  const sameName = bothNames && incomingName === existingName;
  const bothYears = incoming.releaseYear !== null && existing.releaseYear !== null;
  const sameYear = bothYears && incoming.releaseYear === existing.releaseYear;
  const yearDiffers = bothYears && !sameYear;
  const incomingThemes = incoming.themes.map(comparable).filter((value): value is string => Boolean(value));
  const existingThemes = existing.themes.map(comparable).filter((value): value is string => Boolean(value));
  const bothThemes = incomingThemes.length > 0 && existingThemes.length > 0;
  const themesOverlap = bothThemes && incomingThemes.some((theme) => existingThemes.includes(theme));
  const themesDiffer = bothThemes && !themesOverlap;

  // An identical label alone is not enough: generic names are commonly reused.
  // Require at least one aligned secondary signal before merging two records.
  if (sameName && !yearDiffers && !themesDiffer && (sameYear || themesOverlap)) return "MATCH";
  if (!bothNames) return "AMBIGUOUS";

  const similarity = tokenSimilarity(incomingName!, existingName!);
  const incomingQualifier = qualifierParts(incoming.name!);
  const existingQualifier = qualifierParts(existing.name!);
  const explicitQualifierDiffers = Boolean(
    incomingQualifier?.stem
    && incomingQualifier.stem === existingQualifier?.stem
    && incomingQualifier.qualifier !== existingQualifier.qualifier,
  );
  if (explicitQualifierDiffers && (!bothYears || sameYear)) return "DISTINCT";

  const incomingFamily = kindFamily(incoming.productKind, incoming.format);
  const existingFamily = kindFamily(existing.productKind, existing.format);
  const sameSpecialFamily = incomingFamily === existingFamily && incomingFamily !== "OTHER";
  if (sameSpecialFamily && incomingFamily === "FIGURE" && similarity < 0.8) return "DISTINCT";
  if (sameSpecialFamily && (incomingFamily === "CATALOGUE" || incomingFamily === "PERIODICAL") && yearDiffers) return "DISTINCT";
  const incomingIssue = issueDescriptor(incoming.name!);
  const existingIssue = issueDescriptor(existing.name!);
  if (sameSpecialFamily && incomingFamily === "PERIODICAL" && incomingIssue && existingIssue && incomingIssue !== existingIssue) return "DISTINCT";

  if ((yearDiffers || themesDiffer) && similarity < 0.75) return "DISTINCT";
  return "AMBIGUOUS";
}

export interface IdentityResolution {
  productKey: string;
  variantKey: string;
  matchedCandidate?: IdentitySnapshot;
  referenceClass: ReferenceIdentityClass;
  needsReview: boolean;
  reason: "assigned-reference" | "placeholder-reference" | "reused-reference" | "true-identity-conflict";
}

export function resolveIdentityKeys(
  item: RawCollectible,
  parsed: ParsedReference,
  candidates: IdentitySnapshot[] = [],
): IdentityResolution {
  const defaultProductKey = `ref:${parsed.base}`;
  const defaultVariantKey = `ref:${parsed.normalized}`;
  const qualifier = stableRecordQualifier(item.source, item.externalId);
  const qualified = {
    productKey: `${defaultProductKey}:record:${qualifier}`,
    variantKey: `${defaultVariantKey}:record:${qualifier}`,
  };

  if (isPlaceholderReference(parsed.normalized)) return {
    ...qualified,
    referenceClass: "PLACEHOLDER",
    needsReview: false,
    reason: "placeholder-reference",
  };
  if (candidates.length === 0) return {
    productKey: defaultProductKey,
    variantKey: defaultVariantKey,
    referenceClass: "ASSIGNED",
    needsReview: false,
    reason: "assigned-reference",
  };

  const incoming = snapshotFromItem(item, inferIdentityProductKind(item));
  const relationships = candidates.map((candidate) => ({ candidate, relationship: compareIdentitySignals(incoming, candidate) }));
  const matches = relationships.filter(({ relationship }) => relationship === "MATCH");
  const ambiguous = relationships.filter(({ relationship }) => relationship === "AMBIGUOUS");
  if (matches.length === 1 && ambiguous.length === 0) {
    const candidate = matches[0]!.candidate;
    return {
      productKey: candidate.productKey ?? defaultProductKey,
      variantKey: candidate.variantKey ?? defaultVariantKey,
      matchedCandidate: candidate,
      referenceClass: candidate.referenceClass === "REUSED" ? "REUSED" : "ASSIGNED",
      needsReview: false,
      reason: candidate.referenceClass === "REUSED" ? "reused-reference" : "assigned-reference",
    };
  }
  if (matches.length === 0 && ambiguous.length === 0) return {
    ...qualified,
    referenceClass: "REUSED",
    needsReview: false,
    reason: "reused-reference",
  };
  return {
    ...qualified,
    referenceClass: "AMBIGUOUS",
    needsReview: true,
    reason: "true-identity-conflict",
  };
}

function inferIdentityProductKind(item: RawCollectible): string {
  const signal = [item.format, ...(item.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
  if (/catalog/.test(signal)) return "CATALOGUE";
  if (/merch|sticker|book|magazine|multimedia/.test(signal)) return "MERCHANDISE";
  if (/promotional|promotion/.test(signal) || item.isPromotion) return "PROMOTIONAL_ITEM";
  if (/figure/.test(signal)) return "FIGURE";
  return "SET";
}
