export interface Candidate<T> {
  id: string;
  value: T;
  source: string;
  priority: number;
  confidence: number;
  retrievedAt: Date;
}

export interface Resolution<T> {
  selected: Candidate<T> | null;
  conflict: boolean;
  candidates: Candidate<T>[];
  reason: "no-value" | "single-value" | "priority" | "confidence" | "recency";
}

const stable = (value: unknown): string => JSON.stringify(value, Object.keys((value as object) ?? {}).sort());

/** Lower numeric priority wins. Confidence and recency only break ties. */
export function resolveCandidates<T>(input: Candidate<T>[]): Resolution<T> {
  const candidates = input.filter((candidate) => candidate.value !== null && candidate.value !== undefined);
  if (candidates.length === 0) return { selected: null, conflict: false, candidates, reason: "no-value" };
  const distinct = new Set(candidates.map((candidate) => stable(candidate.value)));
  if (candidates.length === 1) return { selected: candidates[0] ?? null, conflict: false, candidates, reason: "single-value" };

  const sorted = [...candidates].sort(
    (a, b) => a.priority - b.priority || b.confidence - a.confidence || b.retrievedAt.getTime() - a.retrievedAt.getTime(),
  );
  const selected = sorted[0] ?? null;
  const runnerUp = sorted[1];
  const reason = !runnerUp || selected!.priority !== runnerUp.priority
    ? "priority"
    : selected!.confidence !== runnerUp.confidence
      ? "confidence"
      : "recency";
  return { selected, conflict: distinct.size > 1, candidates, reason };
}
