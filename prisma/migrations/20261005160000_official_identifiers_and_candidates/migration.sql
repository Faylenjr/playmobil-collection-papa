CREATE TYPE "ProductIdentifierType" AS ENUM ('EAN', 'GTIN', 'UPC', 'MPN', 'OFFICIAL_SKU');
CREATE TYPE "IdentifierConfidenceStatus" AS ENUM ('SOURCE_OBSERVED', 'CORROBORATED', 'OFFICIAL_CONFIRMED', 'CONFLICTING', 'REJECTED');
CREATE TYPE "ExternalCandidateStatus" AS ENUM ('DISCOVERED', 'CORROBORATED', 'OFFICIAL_CONFIRMED', 'CONFLICTING', 'REJECTED', 'IMPORTED');

CREATE TABLE "product_identifiers" (
  "id" UUID NOT NULL,
  "observation_key" TEXT NOT NULL,
  "product_id" UUID,
  "variant_id" UUID,
  "type" "ProductIdentifierType" NOT NULL,
  "raw_value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "source_id" UUID NOT NULL,
  "market_id" UUID,
  "source_url" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "confidence" "IdentifierConfidenceStatus" NOT NULL DEFAULT 'SOURCE_OBSERVED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_identifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_identifiers_single_target_check" CHECK (num_nonnulls("product_id", "variant_id") = 1),
  CONSTRAINT "product_identifiers_values_check" CHECK (length(trim("raw_value")) > 0 AND length(trim("normalized_value")) > 0),
  CONSTRAINT "product_identifiers_source_url_check" CHECK ("source_url" ~ '^https://')
);

CREATE UNIQUE INDEX "product_identifiers_observation_key_key" ON "product_identifiers"("observation_key");
CREATE INDEX "product_identifiers_type_normalized_value_idx" ON "product_identifiers"("type", "normalized_value");
CREATE INDEX "product_identifiers_product_id_idx" ON "product_identifiers"("product_id");
CREATE INDEX "product_identifiers_variant_id_idx" ON "product_identifiers"("variant_id");

CREATE TABLE "external_candidates" (
  "id" UUID NOT NULL,
  "display_reference" TEXT NOT NULL,
  "normalized_reference" TEXT NOT NULL,
  "status" "ExternalCandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
  "conflict_reason" TEXT,
  "imported_product_id" UUID,
  "first_observed_at" TIMESTAMP(3) NOT NULL,
  "last_observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_candidates_normalized_reference_key" ON "external_candidates"("normalized_reference");
CREATE INDEX "external_candidates_status_last_observed_at_idx" ON "external_candidates"("status", "last_observed_at" DESC);

CREATE TABLE "external_candidate_observations" (
  "id" UUID NOT NULL,
  "observation_key" TEXT NOT NULL,
  "candidate_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "source_url" TEXT NOT NULL,
  "observed_name" TEXT,
  "announced_year" INTEGER,
  "announced_month" TEXT,
  "first_observed_at" TIMESTAMP(3) NOT NULL,
  "last_observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_candidate_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_candidate_observations_source_url_check" CHECK ("source_url" ~ '^https://')
);

CREATE UNIQUE INDEX "external_candidate_observations_observation_key_key" ON "external_candidate_observations"("observation_key");
CREATE INDEX "external_candidate_observations_candidate_id_source_id_idx" ON "external_candidate_observations"("candidate_id", "source_id");

ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_candidates" ADD CONSTRAINT "external_candidates_imported_product_id_fkey" FOREIGN KEY ("imported_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_candidate_observations" ADD CONSTRAINT "external_candidate_observations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "external_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_candidate_observations" ADD CONSTRAINT "external_candidate_observations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
