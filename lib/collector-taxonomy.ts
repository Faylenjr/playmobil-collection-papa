export function isXxlCollectorCandidate(input: { format: string | null; variantName: string | null; productName: string | null }) {
  return input.format === "Decoration toy" && /(^|[^a-z0-9])xxl([^a-z0-9]|$)/i.test(`${input.variantName ?? ""} ${input.productName ?? ""}`);
}

export function explicitExclusiveClaim(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).exclusive;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function explicitMarketExclusiveClaim(raw: unknown, marketCode?: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).marketExclusive;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const claim = value as Record<string, unknown>;
  const claimMarket = typeof claim.marketCode === "string" ? claim.marketCode.trim().toUpperCase() : "";
  const statement = typeof claim.statement === "string" ? claim.statement.trim() : "";
  if (!claimMarket || !statement || (marketCode && claimMarket !== marketCode.trim().toUpperCase())) return null;
  return { marketCode: claimMarket, statement };
}

const marketEditionKinds = new Set(["MARKET", "EDITION", "EXCLUSIVE", "PROMOTION"]);

export function classifyMarketRelation(input: { variantKind: string; rawPayload: unknown; marketCode?: string }) {
  const geographicClaim = explicitMarketExclusiveClaim(input.rawPayload, input.marketCode);
  if (geographicClaim) {
    return {
      kind: "ATTESTED_EXCLUSIVE" as const,
      evidence: `Exclusivité géographique attestée pour ${geographicClaim.marketCode} : ${geographicClaim.statement}`,
      confidence: 0.95,
    };
  }

  const commercialChannel = explicitExclusiveClaim(input.rawPayload);
  const context = commercialChannel
    ? ` Canal ou partenaire observé : ${commercialChannel}; ce champ ne prouve pas une exclusivité géographique.`
    : "";
  if (marketEditionKinds.has(input.variantKind)) {
    return {
      kind: "MARKET_EDITION" as const,
      evidence: `Variante structurée pour ce marché, sans preuve d’exclusivité géographique.${context}`,
      confidence: 0.8,
    };
  }
  return {
    kind: "PRESENCE" as const,
    evidence: `Présence documentée sur ce marché, sans preuve d’exclusivité géographique.${context}`,
    confidence: 0.7,
  };
}
