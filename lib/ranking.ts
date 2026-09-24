import { Prisma } from "../generated/prisma/client";

export const collectorClasses = [
  "MAIN_SET", "BUILDING_SET", "VEHICLE_SET", "SMALL_SET", "FIGURE_PACK",
  "SINGLE_FIGURE", "ANIMAL", "ACCESSORY", "PART", "CATALOGUE", "PROMOTIONAL", "UNKNOWN",
] as const;

export type CollectorClass = (typeof collectorClasses)[number];

const classPriority: Record<CollectorClass, number> = {
  MAIN_SET: 110, BUILDING_SET: 100, VEHICLE_SET: 90, SMALL_SET: 80,
  FIGURE_PACK: 70, SINGLE_FIGURE: 60, ANIMAL: 50, ACCESSORY: 40,
  PART: 30, CATALOGUE: 20, PROMOTIONAL: 10, UNKNOWN: 0,
};

const buildingTags = [
  "buildings", "rooms", "store", "castle", "houses", "school", "hospital",
  "police station", "fire station", "train station", "service station", "ranch",
  "hotel", "saloon", "bank", "harbor", "airport", "military fort", "farm",
] as const;
const directBuildingTags = [
  "buildings", "rooms", "castle", "houses", "police station", "fire station",
  "train station", "service station", "ranch", "hotel", "saloon", "bank",
  "harbor", "airport", "military fort",
] as const;
const vehicleTags = [
  "cars", "motorbikes", "rowboats", "vans", "trailers", "trucks", "motorboats",
  "trains", "bicycles", "carts", "helicopters", "race vehicles", "sailboats",
  "police vehicles", "farm machines", "ships", "wagons", "fire engines", "airplanes",
  "construction machines", "ambulances", "carriages", "campers", "bus", "locomotives",
  "stagecoaches", "passenger cars", "space vehicles", "biplanes", "caravans", "submarines",
] as const;
const strongVehicleTags = [
  "cars", "motorbikes", "vans", "trucks", "motorboats", "trains", "helicopters",
  "race vehicles", "sailboats", "police vehicles", "farm machines", "ships",
  "fire engines", "airplanes", "construction machines", "ambulances", "campers",
  "bus", "locomotives", "stagecoaches", "passenger cars", "space vehicles",
  "biplanes", "caravans", "submarines",
] as const;
const animalTags = ["animals", "domestic animals", "wild animals", "aquatic animals", "prehistoric animals"] as const;
const accessoryTags = ["accessories", "extensions", "stickers", "plants-rocks", "storage", "crafting"] as const;
const peopleTags = [
  "children", "professions", "sportsmen", "policemen", "soldiers", "firemen", "doctors",
  "nurses", "workers", "pirates", "knights", "cowboys", "indians", "farmers", "musicians",
  "teachers", "families",
] as const;

function tagExistsSql(tags: readonly string[]) {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "source_records" sr
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(sr."raw_payload"->'tags', '[]'::jsonb)) source_tag(value)
    WHERE sr."variant_id" = pv."id"
      AND source_tag.value IN (${Prisma.join(tags)})
  )`;
}

const hasBuildingTagSql = tagExistsSql(buildingTags);
const hasDirectBuildingTagSql = tagExistsSql(directBuildingTags);
const hasVehicleTagSql = tagExistsSql(vehicleTags);
const hasStrongVehicleTagSql = tagExistsSql(strongVehicleTags);
const hasAnimalTagSql = tagExistsSql(animalTags);
const hasAccessoryTagSql = tagExistsSql(accessoryTags);
const hasPeopleTagSql = tagExistsSql(peopleTags);
const hasAssignedReferenceSql = Prisma.sql`EXISTS (
  SELECT 1 FROM "product_references" pr
  WHERE pr."variant_id" = pv."id"
    AND pr."identity_class"::text = 'ASSIGNED'
    AND pr."normalized_value" !~ '^(0+|N/?A)'
)`;
const relatedPartTypesSql = Prisma.sql`(
  (SELECT COUNT(*) FROM "variant_parts" vp WHERE vp."variant_id" = pv."id")
  + (SELECT COUNT(*) FROM "product_parts" pp WHERE pp."product_id" = p."id")
)`;
const hasInstructionSql = Prisma.sql`EXISTS (
  SELECT 1 FROM "instructions" instruction WHERE instruction."variant_id" = pv."id"
)`;

function jsonTagsOverlapSql(tags: readonly string[]) {
  return Prisma.sql`COALESCE(sr."raw_payload"->'tags', '[]'::jsonb) ?| ARRAY[${Prisma.join(tags)}]`;
}

/** Shared aggregates used by catalogue queries so every structured fact is read once. */
export const collectorFactsCtesSql = Prisma.sql`
  collector_reference_facts AS (
    SELECT pr."variant_id", BOOL_OR(
      pr."identity_class"::text = 'ASSIGNED' AND pr."normalized_value" !~ '^(0+|N/?A)'
    ) AS "hasAssignedReference"
    FROM "product_references" pr
    GROUP BY pr."variant_id"
  ),
  collector_tag_facts AS (
    SELECT sr."variant_id",
      BOOL_OR(${jsonTagsOverlapSql(buildingTags)}) AS "hasBuildingTag",
      BOOL_OR(${jsonTagsOverlapSql(directBuildingTags)}) AS "hasDirectBuildingTag",
      BOOL_OR(${jsonTagsOverlapSql(vehicleTags)}) AS "hasVehicleTag",
      BOOL_OR(${jsonTagsOverlapSql(strongVehicleTags)}) AS "hasStrongVehicleTag",
      BOOL_OR(${jsonTagsOverlapSql(animalTags)}) AS "hasAnimalTag",
      BOOL_OR(${jsonTagsOverlapSql(accessoryTags)}) AS "hasAccessoryTag",
      BOOL_OR(${jsonTagsOverlapSql(peopleTags)}) AS "hasPeopleTag"
    FROM "source_records" sr
    WHERE sr."variant_id" IS NOT NULL
    GROUP BY sr."variant_id"
  ),
  collector_variant_part_facts AS (
    SELECT vp."variant_id", COUNT(*)::int AS "partTypes"
    FROM "variant_parts" vp GROUP BY vp."variant_id"
  ),
  collector_product_part_facts AS (
    SELECT pp."product_id", COUNT(*)::int AS "partTypes"
    FROM "product_parts" pp GROUP BY pp."product_id"
  ),
  collector_instruction_facts AS (
    SELECT DISTINCT instruction."variant_id" FROM "instructions" instruction
  )
`;

export const collectorFactsJoinsSql = Prisma.sql`
  LEFT JOIN collector_reference_facts crf ON crf."variant_id" = pv."id"
  LEFT JOIN collector_tag_facts ctf ON ctf."variant_id" = pv."id"
  LEFT JOIN collector_variant_part_facts cvpf ON cvpf."variant_id" = pv."id"
  LEFT JOIN collector_product_part_facts cppf ON cppf."product_id" = p."id"
  LEFT JOIN collector_instruction_facts cif ON cif."variant_id" = pv."id"
`;

export const collectorClassFromFactsSql = Prisma.sql`
  CASE
    WHEN NOT COALESCE(crf."hasAssignedReference", false) THEN 'UNKNOWN'
    WHEN p."kind"::text = 'CATALOGUE' OR pv."format" = 'Magazin' THEN 'CATALOGUE'
    WHEN p."kind"::text IN ('PROMOTIONAL_ITEM', 'MERCHANDISE') OR pv."variant_kind"::text = 'PROMOTION' THEN 'PROMOTIONAL'
    WHEN p."kind"::text = 'PART' THEN 'PART'
    WHEN p."kind"::text = 'ACCESSORY' THEN 'ACCESSORY'
    WHEN pv."format" = 'DS' AND COALESCE(ctf."hasAnimalTag", false) AND NOT COALESCE(ctf."hasPeopleTag", false)
      AND COALESCE(pv."figure_count", 0) <= 1
      AND NOT COALESCE(ctf."hasBuildingTag", false) AND NOT COALESCE(ctf."hasVehicleTag", false) THEN 'ANIMAL'
    WHEN p."kind"::text = 'FIGURE' OR pv."format" = 'Figures' THEN
      CASE WHEN COALESCE(pv."figure_count", 1) > 1 THEN 'FIGURE_PACK' ELSE 'SINGLE_FIGURE' END
    WHEN pv."format" = 'Duo Pack' THEN 'FIGURE_PACK'
    WHEN pv."format" IN ('Old Singleklicky', 'Playmo-Friends', 'Special', 'Blister', 'Bag', 'Pillow Box', 'Easter Egg')
      AND pv."figure_count" IS NOT NULL THEN
      CASE WHEN pv."figure_count" > 1 THEN 'FIGURE_PACK' ELSE 'SINGLE_FIGURE' END
    WHEN pv."format" IN ('Keychains', 'Decoration toy', 'Puzzle', 'Calendar')
      OR COALESCE(ctf."hasAccessoryTag", false) THEN 'ACCESSORY'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND COALESCE(pv."piece_count", 0) >= 150 THEN 'MAIN_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND COALESCE(ctf."hasStrongVehicleTag", false) THEN 'VEHICLE_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND (COALESCE(ctf."hasDirectBuildingTag", false)
        OR (COALESCE(ctf."hasBuildingTag", false) AND (
          cif."variant_id" IS NOT NULL OR COALESCE(cvpf."partTypes", 0) + COALESCE(cppf."partTypes", 0) >= 8
        ))) THEN 'BUILDING_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND COALESCE(ctf."hasVehicleTag", false) AND (
        cif."variant_id" IS NOT NULL OR COALESCE(cvpf."partTypes", 0) + COALESCE(cppf."partTypes", 0) >= 8
      ) THEN 'VEHICLE_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case') THEN 'SMALL_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" = 'DS' THEN 'ACCESSORY'
    ELSE 'UNKNOWN'
  END
`;

export const collectorPriorityFromFactsSql = Prisma.sql`
  CASE (${collectorClassFromFactsSql})
    WHEN 'MAIN_SET' THEN 110 WHEN 'BUILDING_SET' THEN 100 WHEN 'VEHICLE_SET' THEN 90
    WHEN 'SMALL_SET' THEN 80 WHEN 'FIGURE_PACK' THEN 70 WHEN 'SINGLE_FIGURE' THEN 60
    WHEN 'ANIMAL' THEN 50 WHEN 'ACCESSORY' THEN 40 WHEN 'PART' THEN 30
    WHEN 'CATALOGUE' THEN 20 WHEN 'PROMOTIONAL' THEN 10 ELSE 0
  END
`;
/** Structured, conservative classification. Product names are deliberately absent. */
export const collectorClassSql = Prisma.sql`
  CASE
    WHEN NOT (${hasAssignedReferenceSql}) THEN 'UNKNOWN'
    WHEN p."kind"::text = 'CATALOGUE' OR pv."format" = 'Magazin' THEN 'CATALOGUE'
    WHEN p."kind"::text IN ('PROMOTIONAL_ITEM', 'MERCHANDISE') OR pv."variant_kind"::text = 'PROMOTION' THEN 'PROMOTIONAL'
    WHEN p."kind"::text = 'PART' THEN 'PART'
    WHEN p."kind"::text = 'ACCESSORY' THEN 'ACCESSORY'
    WHEN pv."format" = 'DS' AND (${hasAnimalTagSql}) AND NOT (${hasPeopleTagSql})
      AND COALESCE(pv."figure_count", 0) <= 1
      AND NOT (${hasBuildingTagSql}) AND NOT (${hasVehicleTagSql}) THEN 'ANIMAL'
    WHEN p."kind"::text = 'FIGURE' OR pv."format" = 'Figures' THEN
      CASE WHEN COALESCE(pv."figure_count", 1) > 1 THEN 'FIGURE_PACK' ELSE 'SINGLE_FIGURE' END
    WHEN pv."format" = 'Duo Pack' THEN 'FIGURE_PACK'
    WHEN pv."format" IN ('Old Singleklicky', 'Playmo-Friends', 'Special', 'Blister', 'Bag', 'Pillow Box', 'Easter Egg')
      AND pv."figure_count" IS NOT NULL THEN
      CASE WHEN pv."figure_count" > 1 THEN 'FIGURE_PACK' ELSE 'SINGLE_FIGURE' END
    WHEN pv."format" IN ('Keychains', 'Decoration toy', 'Puzzle', 'Calendar')
      OR (${hasAccessoryTagSql}) THEN 'ACCESSORY'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND COALESCE(pv."piece_count", 0) >= 150 THEN 'MAIN_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND (${hasStrongVehicleTagSql}) THEN 'VEHICLE_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND ((${hasDirectBuildingTagSql}) OR ((${hasBuildingTagSql}) AND (${hasInstructionSql} OR ${relatedPartTypesSql} >= 8))) THEN 'BUILDING_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case')
      AND (${hasVehicleTagSql}) AND (${hasInstructionSql} OR ${relatedPartTypesSql} >= 8) THEN 'VEHICLE_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" IN ('Standard Box', 'Carrying Case') THEN 'SMALL_SET'
    WHEN p."kind"::text = 'SET' AND pv."format" = 'DS' THEN 'ACCESSORY'
    ELSE 'UNKNOWN'
  END
`;

export const collectorPrioritySql = Prisma.sql`
  CASE (${collectorClassSql})
    WHEN 'MAIN_SET' THEN 110 WHEN 'BUILDING_SET' THEN 100 WHEN 'VEHICLE_SET' THEN 90
    WHEN 'SMALL_SET' THEN 80 WHEN 'FIGURE_PACK' THEN 70 WHEN 'SINGLE_FIGURE' THEN 60
    WHEN 'ANIMAL' THEN 50 WHEN 'ACCESSORY' THEN 40 WHEN 'PART' THEN 30
    WHEN 'CATALOGUE' THEN 20 WHEN 'PROMOTIONAL' THEN 10 ELSE 0
  END
`;

export type RankingFacts = {
  productKind: "SET" | "FIGURE" | "PART" | "ACCESSORY" | "MERCHANDISE" | "CATALOGUE" | "PROMOTIONAL_ITEM" | "UNKNOWN";
  pieceCount?: number | null;
  figureCount?: number | null;
  variantKind?: string | null;
  format?: string | null;
  relatedPartTypes?: number | null;
  hasInstructions?: boolean | null;
  tags?: string[] | null;
  hasAssignedReference?: boolean;
};

function hasAnyTag(tags: Set<string>, candidates: readonly string[]) {
  return candidates.some((tag) => tags.has(tag));
}

export function classifyCollectorItem(facts: RankingFacts): CollectorClass {
  const tags = new Set((facts.tags ?? []).map((tag) => tag.toLowerCase()));
  const format = facts.format ?? "";
  const figures = facts.figureCount ?? 0;
  const building = hasAnyTag(tags, buildingTags);
  const directBuilding = hasAnyTag(tags, directBuildingTags);
  const vehicle = hasAnyTag(tags, vehicleTags);
  const strongVehicle = hasAnyTag(tags, strongVehicleTags);
  const animal = hasAnyTag(tags, animalTags);
  const accessory = hasAnyTag(tags, accessoryTags);
  const people = hasAnyTag(tags, peopleTags);

  if (!facts.hasAssignedReference) return "UNKNOWN";
  if (facts.productKind === "CATALOGUE" || format === "Magazin") return "CATALOGUE";
  if (["PROMOTIONAL_ITEM", "MERCHANDISE"].includes(facts.productKind) || facts.variantKind === "PROMOTION") return "PROMOTIONAL";
  if (facts.productKind === "PART") return "PART";
  if (facts.productKind === "ACCESSORY") return "ACCESSORY";
  if (format === "DS" && animal && !people && figures <= 1 && !building && !vehicle) return "ANIMAL";
  if (facts.productKind === "FIGURE" || format === "Figures") return figures > 1 ? "FIGURE_PACK" : "SINGLE_FIGURE";
  if (format === "Duo Pack") return "FIGURE_PACK";
  if (["Old Singleklicky", "Playmo-Friends", "Special", "Blister", "Bag", "Pillow Box", "Easter Egg"].includes(format) && facts.figureCount != null) return figures > 1 ? "FIGURE_PACK" : "SINGLE_FIGURE";
  if (["Keychains", "Decoration toy", "Puzzle", "Calendar"].includes(format) || accessory) return "ACCESSORY";
  if (facts.productKind === "SET" && ["Standard Box", "Carrying Case"].includes(format) && (facts.pieceCount ?? 0) >= 150) return "MAIN_SET";
  if (facts.productKind === "SET" && ["Standard Box", "Carrying Case"].includes(format) && strongVehicle) return "VEHICLE_SET";
  if (facts.productKind === "SET" && ["Standard Box", "Carrying Case"].includes(format)
    && (directBuilding || (building && (facts.hasInstructions || (facts.relatedPartTypes ?? 0) >= 8)))) return "BUILDING_SET";
  if (facts.productKind === "SET" && ["Standard Box", "Carrying Case"].includes(format)
    && vehicle && (facts.hasInstructions || (facts.relatedPartTypes ?? 0) >= 8)) return "VEHICLE_SET";
  if (facts.productKind === "SET" && ["Standard Box", "Carrying Case"].includes(format)) return "SMALL_SET";
  if (facts.productKind === "SET" && format === "DS") return "ACCESSORY";
  return "UNKNOWN";
}

export function explainCollectorPriority(facts: RankingFacts) {
  const collectorClass = classifyCollectorItem(facts);
  return { score: classPriority[collectorClass], category: collectorClass, reasons: [`classification structurée : ${collectorClass}`] };
}
