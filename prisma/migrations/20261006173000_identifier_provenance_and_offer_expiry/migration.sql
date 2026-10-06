ALTER TABLE "product_identifiers"
  ADD COLUMN "source_record_id" UUID,
  ADD COLUMN "first_observed_at" TIMESTAMP(3),
  ADD COLUMN "last_observed_at" TIMESTAMP(3);

UPDATE "product_identifiers"
SET "first_observed_at" = "observed_at",
    "last_observed_at" = "observed_at";

ALTER TABLE "product_identifiers"
  ALTER COLUMN "first_observed_at" SET NOT NULL,
  ALTER COLUMN "last_observed_at" SET NOT NULL;

CREATE INDEX "product_identifiers_source_record_id_idx"
  ON "product_identifiers"("source_record_id");

ALTER TABLE "product_identifiers"
  ADD CONSTRAINT "product_identifiers_source_record_id_fkey"
  FOREIGN KEY ("source_record_id") REFERENCES "source_records"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "offers" ADD COLUMN "expires_at" TIMESTAMP(3);
