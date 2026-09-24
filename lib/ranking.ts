import { Prisma } from "../generated/prisma/client";

/**
 * Collector importance is an ordinal category, not a popularity score.
 * The catalogue orders by this category first and by release date second.
 * Production data is sparse, so this uses only present catalogue facts.
 */
export const collectorPrioritySql = Prisma.sql`
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM "product_references" pr
      WHERE pr."variant_id" = pv."id"
        AND pr."identity_class"::text = 'ASSIGNED'
        AND pr."normalized_value" !~ '^(0+|N/?A)'
    ) THEN 0
    WHEN p."kind"::text = 'PART'
      OR LOWER(COALESCE(pv."format", '')) ~ '(part|spare)' THEN 10
    WHEN p."kind"::text IN ('ACCESSORY', 'MERCHANDISE', 'CATALOGUE', 'PROMOTIONAL_ITEM')
      OR LOWER(COALESCE(pv."format", '')) ~ '(accessor|keychain|puzzle|magazin|catalog|calendar|decoration|pillow|bag|easter egg)'
      OR LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(accessories|accessory|extension|fence|replacement|spare parts|furniture|rock landscape|rock form|supplement)([^a-z]|$)' THEN 20
    WHEN (
        p."kind"::text = 'FIGURE'
        OR LOWER(COALESCE(pv."format", '')) ~ '(animal)'
        OR LOWER(COALESCE(pv."name", p."name", '')) ~ '^(animal|animals|horse|horses|pony|ponies|cow|cows|pig|pigs|sheep|lamb|rabbit|bunny|dog|dogs|cat|cats|chicken|chickens|duck|ducks|goat|goats|deer|fox|foxes)([^a-z]|$)'
      )
      AND LOWER(CONCAT_WS(' ', pv."format", COALESCE(pv."name", p."name"))) ~ '(^|[^a-z])(animal|animals|horse|horses|pony|ponies|cow|cows|pig|pigs|sheep|lamb|rabbit|bunny|dog|dogs|cat|cats|chicken|chickens|duck|ducks|goat|goats|deer|fox|foxes)([^a-z]|$)'
      AND COALESCE(pv."figure_count", 0) <= 1 THEN 30
    WHEN p."kind"::text = 'FIGURE'
      OR LOWER(COALESCE(pv."format", '')) ~ '(figures|singleklicky|playmo-friends|duo pack|special|blister)' THEN 40
    WHEN pv."piece_count" >= 300
      OR LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(large|grand|mega)([^a-z]|$)'
      OR LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(superset|super set|mega-set|mega set|complete set)([^a-z]|$)' THEN 100
    WHEN pv."piece_count" >= 150
      OR LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(castle|farmhouse|barn|hospital|school|station|headquarters|fort|fortress|house|home|restaurant|hotel|zoo|playground|playset|camp|market|room|ward|tower|palace|ranch|harbour|harbor|airport|stable|shop)([^a-z]|$)' THEN 90
    WHEN pv."piece_count" >= 75
      OR LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(train|ship|boat|truck|helicopter|ambulance|tractor|carriage|wagon|vehicle|camper|motorhome|bus|van|car|plane|aircraft|bulldozer|excavator|loader|crane|fire engine)([^a-z]|$)' THEN 80
    WHEN LOWER(COALESCE(pv."name", p."name", '')) ~ '(^|[^a-z])(my figures|figure|figures|farmer|shepherd|policeman|policewoman|fireman|firefighter|doctor|nurse|cowboy|knight|princess|child|children|girl|boy|man|woman|family)([^a-z]|$)' THEN 40
    WHEN pv."piece_count" >= 20 OR pv."figure_count" >= 4 THEN 70
    WHEN p."kind"::text = 'SET' THEN 60
    ELSE 50
  END
`;

export type RankingFacts = {
  productKind: "SET" | "FIGURE" | "PART" | "ACCESSORY" | "MERCHANDISE" | "CATALOGUE" | "PROMOTIONAL_ITEM" | "UNKNOWN";
  pieceCount?: number | null;
  figureCount?: number | null;
  variantKind?: string | null;
  format?: string | null;
  name?: string | null;
  productName?: string | null;
  hasAssignedReference?: boolean;
};

type RankingExplanation = { score: number; category: string; reasons: string[] };

export function explainCollectorPriority(facts: RankingFacts): RankingExplanation {
  const name = (facts.name ?? facts.productName ?? "").toLowerCase();
  const format = (facts.format ?? "").toLowerCase();
  const pieces = facts.pieceCount ?? 0;
  const figures = facts.figureCount ?? 0;
  const result = (score: number, category: string, reason: string): RankingExplanation => ({ score, category, reasons: [reason] });

  if (!facts.hasAssignedReference) return result(0, "référence douteuse", "aucune référence commerciale assignée");
  if (facts.productKind === "PART" || /(part|spare)/.test(format)) return result(10, "pièce détachée", "type ou format de pièce détachée");
  if (["ACCESSORY", "MERCHANDISE", "CATALOGUE", "PROMOTIONAL_ITEM"].includes(facts.productKind)
    || /(accessor|keychain|puzzle|magazin|catalog|calendar|decoration|pillow|bag|easter egg)/.test(format)
    || /\b(accessories|accessory|extension|fence|replacement|spare parts|furniture|rock landscape|rock form|supplement)\b/.test(name)) {
    return result(20, "accessoire ou objet secondaire", "type ou format secondaire explicite");
  }
  const animalSignal = /\b(animal|animals|horse|horses|pony|ponies|cow|cows|pig|pigs|sheep|lamb|rabbit|bunny|dog|dogs|cat|cats|chicken|chickens|duck|ducks|goat|goats|deer|fox|foxes)\b/;
  if ((facts.productKind === "FIGURE" || /animal/.test(format) || animalSignal.test(name.split(/\s+/).slice(0, 1).join(" ")))
    && animalSignal.test(`${format} ${name}`) && figures <= 1) {
    return result(30, "animal", "nom ou format animal avec au plus une figurine");
  }
  if (facts.productKind === "FIGURE" || /(figures|singleklicky|playmo-friends|duo pack|special|blister)/.test(format)) {
    return result(40, "figurine", "type ou format de figurine");
  }
  if (pieces >= 300 || /\b(large|grand|mega)\b/.test(name) || /\b(superset|super set|mega-set|mega set|complete set)\b/.test(name)) {
    return result(100, "grand set", pieces >= 300 ? "au moins 300 pièces" : "vocabulaire explicite de grand ensemble");
  }
  if (pieces >= 150 || /\b(castle|farmhouse|barn|hospital|school|station|headquarters|fort|fortress|house|home|restaurant|hotel|zoo|playground|playset|camp|market|room|ward|tower|palace|ranch|harbour|harbor|airport|stable|shop)\b/.test(name)) {
    return result(90, "bâtiment ou playset", pieces >= 150 ? "au moins 150 pièces" : "nom de bâtiment ou playset");
  }
  if (pieces >= 75 || /\b(train|ship|boat|truck|helicopter|ambulance|tractor|carriage|wagon|vehicle|camper|motorhome|bus|van|car|plane|aircraft|bulldozer|excavator|loader|crane|fire engine)\b/.test(name)) {
    return result(80, "véhicule important", pieces >= 75 ? "au moins 75 pièces" : "nom de véhicule");
  }
  if (/\b(my figures|figure|figures|farmer|shepherd|policeman|policewoman|fireman|firefighter|doctor|nurse|cowboy|knight|princess|child|children|girl|boy|man|woman|family)\b/.test(name)) {
    return result(40, "figurine", "type, format ou nom de figurine");
  }
  if (pieces >= 20 || figures >= 4) return result(70, "set moyen", pieces >= 20 ? "au moins 20 pièces" : "au moins quatre figurines");
  if (facts.productKind === "SET") return result(60, "petit set", "set sans signal de taille supérieure");
  return result(50, "objet collectionnable", "aucun signal plus précis");
}
