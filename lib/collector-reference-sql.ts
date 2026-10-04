import { Prisma } from "../generated/prisma/client";

export const collectorCommercialReferencePredicateSql = Prisma.sql`
  pr."identity_class"::text IN ('ASSIGNED', 'REUSED')
  AND COALESCE(pr."base_value", pr."normalized_value") ~ '^[0-9]{3,5}$'
  AND COALESCE(pr."base_value", pr."normalized_value") !~ '^0+$'
  AND p."kind"::text NOT IN ('PART', 'MERCHANDISE', 'CATALOGUE', 'PROMOTIONAL_ITEM')
  AND COALESCE(pv."format", '') NOT IN ('Magazin', 'Keychains', 'Decoration toy')
`;

export const collectorReferenceGroupSql = Prisma.sql`
  CASE
    WHEN ${collectorCommercialReferencePredicateSql} THEN 0
    WHEN pr."identity_class"::text IN ('ASSIGNED', 'REUSED')
      AND pr."normalized_value" !~ '^(N/?A|UNKNOWN|NONE|NULL|UNASSIGNED)$'
      AND COALESCE(pr."base_value", pr."normalized_value") !~ '^0+$' THEN 1
    ELSE 2
  END
`;
