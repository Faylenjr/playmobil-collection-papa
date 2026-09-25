export type PlaymoDbIdentityClass = "ASSIGNED" | "PLACEHOLDER" | "REUSED" | "AMBIGUOUS";

export type PlaymoDbMatchDecision =
  | { status: "MATCH_UNIQUE"; variantId: string; setNumber: string }
  | { status: "ABSENT"; variantId: string; setNumber: string }
  | { status: "REVIEW"; variantId: string; reason: "REUSED_BASE" | "MULTIPLE_SOURCE_MATCHES" }
  | { status: "SKIP"; variantId: string; reason: "UNSAFE_IDENTITY" | "NON_NUMERIC_REFERENCE" };

export type PlaymoDbMatchCandidate = {
  variantId: string;
  identityClass: PlaymoDbIdentityClass;
  normalizedValue: string;
  baseValue: string | null;
  variantsUsingBase: number;
};

/**
 * Conservative preflight/lookup decision for a PlaymoDB set number.
 *
 * Market suffixes never change the target variant: baseValue is only the
 * external lookup key. Reused local bases and multiple source results always
 * go to review and must never be merged automatically.
 */
export function decidePlaymoDbMatch(
  candidate: PlaymoDbMatchCandidate,
  sourceMatchCount: number,
): PlaymoDbMatchDecision {
  if (candidate.identityClass !== "ASSIGNED") {
    return { status: "SKIP", variantId: candidate.variantId, reason: "UNSAFE_IDENTITY" };
  }

  const setNumber = candidate.baseValue?.trim() ?? "";
  if (!/^\d{3,8}$/.test(setNumber) || /^0+$/.test(setNumber)) {
    return { status: "SKIP", variantId: candidate.variantId, reason: "NON_NUMERIC_REFERENCE" };
  }

  if (candidate.variantsUsingBase !== 1) {
    return { status: "REVIEW", variantId: candidate.variantId, reason: "REUSED_BASE" };
  }

  if (sourceMatchCount === 0) {
    return { status: "ABSENT", variantId: candidate.variantId, setNumber };
  }

  if (sourceMatchCount !== 1) {
    return { status: "REVIEW", variantId: candidate.variantId, reason: "MULTIPLE_SOURCE_MATCHES" };
  }

  return { status: "MATCH_UNIQUE", variantId: candidate.variantId, setNumber };
}
