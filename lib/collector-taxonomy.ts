export function isXxlCollectorCandidate(input: { format: string | null; variantName: string | null; productName: string | null }) {
  return input.format === "Decoration toy" && /(^|[^a-z0-9])xxl([^a-z0-9]|$)/i.test(`${input.variantName ?? ""} ${input.productName ?? ""}`);
}

export function explicitExclusiveClaim(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).exclusive;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function classifyMarketRelation(input: { variantKind: string; rawPayload: unknown }) {
  const exclusive = explicitExclusiveClaim(input.rawPayload);
  if (exclusive) return { kind: "ATTESTED_EXCLUSIVE" as const, evidence: `Source explicitement exclusive : ${exclusive}`, confidence: 0.9 };
  if (input.variantKind === "MARKET") return { kind: "MARKET_EDITION" as const, evidence: "Variante structurée pour un marché, sans preuve explicite d’exclusivité", confidence: 0.8 };
  return { kind: "PRESENCE" as const, evidence: "Présence documentée sur ce marché", confidence: 0.7 };
}
