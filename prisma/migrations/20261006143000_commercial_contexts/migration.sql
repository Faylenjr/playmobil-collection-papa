CREATE TYPE "CommercialContextKind" AS ENUM (
  'RETAILER_DISTRIBUTOR',
  'MAGAZINE_PUBLICATION',
  'EVENT_VENUE',
  'ORGANIZATION_ASSOCIATION',
  'PROMOTIONAL_CAMPAIGN',
  'BRAND_LICENSE_PARTNER',
  'OTHER_DOCUMENTED_CONTEXT'
);

CREATE TABLE "commercial_contexts" (
  "id" UUID NOT NULL,
  "kind" "CommercialContextKind" NOT NULL,
  "canonical_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_contexts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_contexts_kind_normalized_name_key" ON "commercial_contexts"("kind", "normalized_name");
CREATE INDEX "commercial_contexts_kind_canonical_name_idx" ON "commercial_contexts"("kind", "canonical_name");

CREATE TABLE "commercial_context_evidence" (
  "id" UUID NOT NULL,
  "context_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "source_record_id" UUID NOT NULL,
  "raw_value" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_context_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_context_evidence_source_record_id_key" ON "commercial_context_evidence"("source_record_id");
CREATE INDEX "commercial_context_evidence_variant_id_idx" ON "commercial_context_evidence"("variant_id");

ALTER TABLE "commercial_context_evidence" ADD CONSTRAINT "commercial_context_evidence_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "commercial_contexts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_context_evidence" ADD CONSTRAINT "commercial_context_evidence_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_context_evidence" ADD CONSTRAINT "commercial_context_evidence_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commercial_context_evidence" ADD CONSTRAINT "commercial_context_evidence_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "source_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
