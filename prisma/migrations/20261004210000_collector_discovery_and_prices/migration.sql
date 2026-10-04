CREATE TYPE "RangeKind" AS ENUM ('LINE', 'SERIES', 'LICENSE', 'SUBLINE');
CREATE TYPE "WavePrecision" AS ENUM ('MONTH', 'RANGE', 'CAMPAIGN');
CREATE TYPE "MarketRelationKind" AS ENUM ('PRESENCE', 'MARKET_EDITION', 'ATTESTED_EXCLUSIVE');
CREATE TYPE "RetailerType" AS ENUM ('SHOP', 'MARKETPLACE', 'PRIVATE_LISTING', 'MANUFACTURER');
CREATE TYPE "OfferCondition" AS ENUM ('NEW', 'USED', 'SEALED', 'UNKNOWN');
CREATE TYPE "OfferAvailability" AS ENUM ('AVAILABLE', 'OUT_OF_STOCK', 'ENDED', 'UNKNOWN');

CREATE TABLE "product_ranges" (
  "id" UUID NOT NULL, "slug" TEXT NOT NULL, "canonical_name" TEXT NOT NULL,
  "kind" "RangeKind" NOT NULL, "description" TEXT, "start_year" INTEGER, "end_year" INTEGER,
  "market_id" UUID, "source_id" UUID NOT NULL, "source_url" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_ranges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_ranges_slug_key" ON "product_ranges"("slug");
CREATE INDEX "product_ranges_market_id_idx" ON "product_ranges"("market_id");

CREATE TABLE "range_memberships" (
  "range_id" UUID NOT NULL, "product_id" UUID NOT NULL, "observed_reference" TEXT NOT NULL,
  "source_url" TEXT NOT NULL, "confidence" DECIMAL(4,3) NOT NULL DEFAULT 1,
  "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "range_memberships_pkey" PRIMARY KEY ("range_id", "product_id")
);
CREATE INDEX "range_memberships_product_id_idx" ON "range_memberships"("product_id");

CREATE TABLE "release_waves" (
  "id" UUID NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "release_year" INTEGER NOT NULL,
  "period_start" DATE NOT NULL, "period_end" DATE NOT NULL, "precision" "WavePrecision" NOT NULL,
  "market_id" UUID NOT NULL, "range_id" UUID, "source_id" UUID NOT NULL, "source_url" TEXT NOT NULL,
  "document_hash" TEXT, "observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "release_waves_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "release_waves_slug_key" ON "release_waves"("slug");
CREATE INDEX "release_waves_release_year_period_start_idx" ON "release_waves"("release_year", "period_start");

CREATE TABLE "release_wave_items" (
  "release_wave_id" UUID NOT NULL, "product_id" UUID NOT NULL, "observed_reference" TEXT NOT NULL,
  "official_order" INTEGER NOT NULL, "manifest_order" INTEGER NOT NULL, "match_status" TEXT NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "release_wave_items_pkey" PRIMARY KEY ("release_wave_id", "product_id")
);
CREATE UNIQUE INDEX "release_wave_items_release_wave_id_observed_reference_key" ON "release_wave_items"("release_wave_id", "observed_reference");
CREATE INDEX "release_wave_items_product_id_idx" ON "release_wave_items"("product_id");

CREATE TABLE "collector_categories" (
  "id" UUID NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "rule_version" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collector_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "collector_categories_slug_key" ON "collector_categories"("slug");

CREATE TABLE "variant_category_memberships" (
  "category_id" UUID NOT NULL, "variant_id" UUID NOT NULL, "source_id" UUID,
  "source_url" TEXT, "evidence" TEXT NOT NULL, "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "variant_category_memberships_pkey" PRIMARY KEY ("category_id", "variant_id")
);
CREATE INDEX "variant_category_memberships_variant_id_idx" ON "variant_category_memberships"("variant_id");

CREATE TABLE "market_evidence" (
  "id" UUID NOT NULL, "variant_id" UUID NOT NULL, "market_id" UUID NOT NULL,
  "kind" "MarketRelationKind" NOT NULL, "source_id" UUID, "source_url" TEXT,
  "evidence" TEXT NOT NULL, "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0.8, "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "market_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "market_evidence_variant_id_market_id_kind_key" ON "market_evidence"("variant_id", "market_id", "kind");
CREATE INDEX "market_evidence_market_id_kind_idx" ON "market_evidence"("market_id", "kind");

CREATE TABLE "retailers" (
  "id" UUID NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "type" "RetailerType" NOT NULL,
  "country_code" VARCHAR(2), "base_url" TEXT NOT NULL, "source_id" UUID, "market_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "retailers_slug_key" ON "retailers"("slug");
CREATE INDEX "retailers_market_id_idx" ON "retailers"("market_id");

CREATE TABLE "offers" (
  "id" UUID NOT NULL, "retailer_id" UUID NOT NULL, "product_id" UUID, "variant_id" UUID,
  "external_id" TEXT NOT NULL, "url" TEXT NOT NULL, "condition" "OfferCondition" NOT NULL DEFAULT 'UNKNOWN',
  "availability" "OfferAvailability" NOT NULL DEFAULT 'UNKNOWN', "match_confidence" DECIMAL(4,3),
  "match_evidence" TEXT, "first_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offers_single_target_check" CHECK (("product_id" IS NOT NULL)::int + ("variant_id" IS NOT NULL)::int = 1),
  CONSTRAINT "offers_http_url_check" CHECK ("url" ~ '^https://')
);
CREATE UNIQUE INDEX "offers_retailer_id_external_id_key" ON "offers"("retailer_id", "external_id");
CREATE INDEX "offers_product_id_availability_idx" ON "offers"("product_id", "availability");
CREATE INDEX "offers_variant_id_availability_idx" ON "offers"("variant_id", "availability");

CREATE TABLE "price_observations" (
  "id" UUID NOT NULL, "offer_id" UUID NOT NULL, "item_price" DECIMAL(12,2) NOT NULL,
  "shipping_price" DECIMAL(12,2), "total_price" DECIMAL(12,2), "currency" VARCHAR(3) NOT NULL,
  "availability" "OfferAvailability" NOT NULL, "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_observations_nonnegative_check" CHECK ("item_price" >= 0 AND ("shipping_price" IS NULL OR "shipping_price" >= 0) AND ("total_price" IS NULL OR "total_price" >= 0))
);
CREATE INDEX "price_observations_offer_id_observed_at_idx" ON "price_observations"("offer_id", "observed_at" DESC);

CREATE TABLE "list_price_observations" (
  "id" UUID NOT NULL, "variant_id" UUID NOT NULL, "market_id" UUID NOT NULL, "source_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "currency" VARCHAR(3) NOT NULL, "source_url" TEXT NOT NULL,
  "valid_from" DATE, "valid_until" DATE, "observed_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "list_price_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "list_price_observations_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "list_price_observations_dates_check" CHECK ("valid_until" IS NULL OR "valid_from" IS NULL OR "valid_until" >= "valid_from")
);
CREATE INDEX "list_price_observations_variant_id_market_id_observed_at_idx" ON "list_price_observations"("variant_id", "market_id", "observed_at" DESC);

ALTER TABLE "product_ranges" ADD CONSTRAINT "product_ranges_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_ranges" ADD CONSTRAINT "product_ranges_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "range_memberships" ADD CONSTRAINT "range_memberships_range_id_fkey" FOREIGN KEY ("range_id") REFERENCES "product_ranges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "range_memberships" ADD CONSTRAINT "range_memberships_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_waves" ADD CONSTRAINT "release_waves_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_waves" ADD CONSTRAINT "release_waves_range_id_fkey" FOREIGN KEY ("range_id") REFERENCES "product_ranges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "release_waves" ADD CONSTRAINT "release_waves_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_wave_items" ADD CONSTRAINT "release_wave_items_release_wave_id_fkey" FOREIGN KEY ("release_wave_id") REFERENCES "release_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_wave_items" ADD CONSTRAINT "release_wave_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_category_memberships" ADD CONSTRAINT "variant_category_memberships_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "collector_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_category_memberships" ADD CONSTRAINT "variant_category_memberships_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_category_memberships" ADD CONSTRAINT "variant_category_memberships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "market_evidence" ADD CONSTRAINT "market_evidence_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_evidence" ADD CONSTRAINT "market_evidence_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_evidence" ADD CONSTRAINT "market_evidence_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retailers" ADD CONSTRAINT "retailers_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offers" ADD CONSTRAINT "offers_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "list_price_observations" ADD CONSTRAINT "list_price_observations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "list_price_observations" ADD CONSTRAINT "list_price_observations_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "list_price_observations" ADD CONSTRAINT "list_price_observations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
