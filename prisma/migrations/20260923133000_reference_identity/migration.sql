-- Additive identity metadata. No product, variant, reference, provenance value,
-- conflict, or review task is deleted or merged by this migration.
-- This guard deliberately runs before every DDL statement: even migration
-- runners that do not wrap PostgreSQL migrations in a transaction cannot leave
-- the new identity schema half-applied when provenance is inconsistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT sv."source_record_id"
    FROM "source_values" sv
    WHERE sv."entity_type" = 'ProductVariant'
    GROUP BY sv."source_record_id"
    HAVING COUNT(DISTINCT sv."entity_id") > 1
  ) THEN
    RAISE EXCEPTION 'Identity migration aborted: at least one SourceRecord points to multiple ProductVariant identities';
  END IF;
END $$;

CREATE TYPE "ReferenceIdentityClass" AS ENUM ('ASSIGNED', 'PLACEHOLDER', 'REUSED', 'AMBIGUOUS');

ALTER TABLE "product_references"
  ADD COLUMN "identity_class" "ReferenceIdentityClass" NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN "identity_reason" TEXT;

ALTER TABLE "source_records"
  ADD COLUMN "variant_id" UUID;

ALTER TABLE "review_tasks"
  ADD COLUMN "resolution_note" TEXT;

ALTER TABLE "source_records"
  ADD CONSTRAINT "source_records_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "source_records_variant_id_idx" ON "source_records"("variant_id");
CREATE INDEX "product_references_identity_class_idx" ON "product_references"("identity_class");

-- Backfill the explicit link from existing provenance rows. The guard above
-- proves that at most one ProductVariant UUID exists for each SourceRecord.

UPDATE "source_records" AS sr
SET "variant_id" = (
  SELECT DISTINCT sv."entity_id"
  FROM "source_values" AS sv
  WHERE sv."source_record_id" = sr."id"
    AND sv."entity_type" = 'ProductVariant'
    AND EXISTS (SELECT 1 FROM "product_variants" pv WHERE pv."id" = sv."entity_id")
  LIMIT 1
)
WHERE sr."variant_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "source_values" sv
    JOIN "product_variants" pv ON pv."id" = sv."entity_id"
    WHERE sv."source_record_id" = sr."id"
      AND sv."entity_type" = 'ProductVariant'
  );

-- Only the syntactically certain placeholder family is classified in SQL.
-- Reused and ambiguous references need the conservative signal comparison in
-- the TypeScript reclassifier and are intentionally not guessed here.
UPDATE "product_references"
SET "identity_class" = 'PLACEHOLDER',
    "identity_reason" = 'syntactic-placeholder-reference'
WHERE UPPER(REGEXP_REPLACE("normalized_value", '[[:space:]]+', '', 'g'))
  ~ '^(0+(V[0-9]+)?(-[A-Z0-9-]+)?|N/?A(-[A-Z0-9-]+)?)$';
