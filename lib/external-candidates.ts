export type CandidateEvidence = {
  sourceKey: string;
  announcedYear: number | null;
  official: boolean;
};

export type CandidateStatusValue = "DISCOVERED" | "CORROBORATED" | "OFFICIAL_CONFIRMED" | "CONFLICTING" | "REJECTED" | "IMPORTED";

export function deriveCandidateStatus(evidence: readonly CandidateEvidence[], imported = false): { status: CandidateStatusValue; conflictReason: string | null } {
  if (imported) return { status: "IMPORTED", conflictReason: null };
  if (evidence.some((item) => item.official)) return { status: "OFFICIAL_CONFIRMED", conflictReason: null };
  const years = [...new Set(evidence.map((item) => item.announcedYear).filter((year): year is number => year !== null))].sort();
  if (years.length > 1) return { status: "CONFLICTING", conflictReason: `Années annoncées incompatibles : ${years.join(", ")}` };
  if (new Set(evidence.map((item) => item.sourceKey)).size > 1) return { status: "CORROBORATED", conflictReason: null };
  return { status: "DISCOVERED", conflictReason: null };
}

export function candidateObservationKey(reference: string, sourceKey: string, sourceUrl: string) {
  return `${reference.trim().toUpperCase()}|${sourceKey}|${sourceUrl}`;
}
