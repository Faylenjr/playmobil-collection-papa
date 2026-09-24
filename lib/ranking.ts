import { Prisma } from "../generated/prisma/client";

/**
 * Explainable collector-first ranking. It deliberately uses only catalogue
 * facts: product kind, size, figures, commercial reference and format words.
 */
export const collectorPrioritySql = Prisma.sql`
  (CASE p."kind"::text
    WHEN 'SET' THEN 100
    WHEN 'PROMOTIONAL_ITEM' THEN 45
    WHEN 'MERCHANDISE' THEN 35
    WHEN 'CATALOGUE' THEN 25
    WHEN 'FIGURE' THEN 10
    WHEN 'ACCESSORY' THEN 0
    WHEN 'PART' THEN -20
    ELSE 15
  END)
  + (CASE
      WHEN pv."piece_count" >= 300 THEN 40
      WHEN pv."piece_count" >= 150 THEN 30
      WHEN pv."piece_count" >= 75 THEN 20
      WHEN pv."piece_count" >= 20 THEN 10
      WHEN pv."piece_count" BETWEEN 1 AND 4 THEN -12
      ELSE 0
    END)
  + (CASE
      WHEN pv."figure_count" >= 4 THEN 12
      WHEN pv."figure_count" >= 2 THEN 7
      ELSE 0
    END)
  + (CASE WHEN pv."variant_kind"::text IN ('BOX', 'EDITION', 'REISSUE') THEN 8 ELSE 0 END)
  + (CASE
      WHEN LOWER(COALESCE(pv."format", '')) ~ '(large|box|boxed|building|vehicle|playset|set)' THEN 12
      WHEN LOWER(COALESCE(pv."format", '')) ~ '(figure|animal)' THEN -15
      WHEN LOWER(COALESCE(pv."format", '')) ~ '(part|accessor)' THEN -22
      ELSE 0
    END)
  + (CASE WHEN EXISTS (
      SELECT 1 FROM "product_references" pr
      WHERE pr."variant_id" = pv."id"
        AND pr."identity_class"::text = 'ASSIGNED'
        AND pr."normalized_value" !~ '^(0+|N/?A)'
    ) THEN 15 ELSE -20 END)
`;

export type RankingFacts = {
  productKind: "SET" | "FIGURE" | "PART" | "ACCESSORY" | "MERCHANDISE" | "CATALOGUE" | "PROMOTIONAL_ITEM" | "UNKNOWN";
  pieceCount?: number | null;
  figureCount?: number | null;
  variantKind?: string | null;
  format?: string | null;
  hasAssignedReference?: boolean;
};

export function explainCollectorPriority(facts: RankingFacts) {
  const reasons: string[] = [];
  const kindScores = { SET: 100, PROMOTIONAL_ITEM: 45, MERCHANDISE: 35, CATALOGUE: 25, UNKNOWN: 15, FIGURE: 10, ACCESSORY: 0, PART: -20 };
  let score = kindScores[facts.productKind];
  reasons.push(`type ${facts.productKind}: ${score >= 0 ? "+" : ""}${score}`);

  const pieces = facts.pieceCount ?? 0;
  const pieceScore = pieces >= 300 ? 40 : pieces >= 150 ? 30 : pieces >= 75 ? 20 : pieces >= 20 ? 10 : pieces >= 1 && pieces <= 4 ? -12 : 0;
  score += pieceScore;
  if (pieceScore) reasons.push(`taille: ${pieceScore > 0 ? "+" : ""}${pieceScore}`);

  const figures = facts.figureCount ?? 0;
  const figureScore = figures >= 4 ? 12 : figures >= 2 ? 7 : 0;
  score += figureScore;
  if (figureScore) reasons.push(`figurines incluses: +${figureScore}`);

  const variantScore = ["BOX", "EDITION", "REISSUE"].includes(facts.variantKind ?? "") ? 8 : 0;
  score += variantScore;
  if (variantScore) reasons.push("édition commerciale: +8");

  const format = (facts.format ?? "").toLowerCase();
  const formatScore = /(large|box|boxed|building|vehicle|playset|set)/.test(format) ? 12 : /(figure|animal)/.test(format) ? -15 : /(part|accessor)/.test(format) ? -22 : 0;
  score += formatScore;
  if (formatScore) reasons.push(`format: ${formatScore > 0 ? "+" : ""}${formatScore}`);

  const referenceScore = facts.hasAssignedReference ? 15 : -20;
  score += referenceScore;
  reasons.push(`référence commerciale: ${referenceScore > 0 ? "+" : ""}${referenceScore}`);
  return { score, reasons };
}
