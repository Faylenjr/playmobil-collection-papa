-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SET', 'FIGURE', 'PART', 'ACCESSORY', 'MERCHANDISE', 'CATALOGUE', 'PROMOTIONAL_ITEM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VariantKind" AS ENUM ('STANDARD', 'MARKET', 'BOX', 'REISSUE', 'PROMOTION', 'EXCLUSIVE', 'EDITION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('OFFICIAL', 'COMMUNITY_DATABASE', 'COMMUNITY_EDITORIAL', 'RETAILER', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('OPEN', 'AUTO_RESOLVED', 'MANUALLY_RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CollectionCondition" AS ENUM ('SEALED', 'NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "base_reference" TEXT,
    "kind" "ProductKind" NOT NULL DEFAULT 'UNKNOWN',
    "release_year" INTEGER,
    "discontinued_year" INTEGER,
    "name" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "variant_kind" "VariantKind" NOT NULL DEFAULT 'STANDARD',
    "variant_label" TEXT,
    "edition_number" INTEGER,
    "is_collectible" BOOLEAN NOT NULL DEFAULT true,
    "is_exclusive" BOOLEAN,
    "is_promotion" BOOLEAN,
    "release_date" DATE,
    "status" TEXT,
    "age_min" INTEGER,
    "age_max" INTEGER,
    "piece_count" INTEGER,
    "figure_count" INTEGER,
    "list_price" DECIMAL(12,2),
    "list_price_currency" VARCHAR(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_references" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "display_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "base_value" TEXT,
    "suffix" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source_id" UUID,

    CONSTRAINT "product_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "locale" VARCHAR(12) NOT NULL,
    "name" TEXT,
    "description" TEXT,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_themes" (
    "product_id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_themes_pkey" PRIMARY KEY ("product_id","theme_id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_markets" (
    "variant_id" UUID NOT NULL,
    "market_id" UUID NOT NULL,

    CONSTRAINT "variant_markets_pkey" PRIMARY KEY ("variant_id","market_id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "author" TEXT,
    "copyright_owner" TEXT,
    "license" TEXT,
    "can_rehost" BOOLEAN,
    "can_display" BOOLEAN,
    "last_verified_at" TIMESTAMP(3),
    "content_hash" TEXT,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructions" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "locale" VARCHAR(12),
    "document_url" TEXT NOT NULL,
    "page_count" INTEGER,
    "can_rehost" BOOLEAN,
    "last_verified_at" TIMESTAMP(3),

    CONSTRAINT "instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "figures" (
    "id" UUID NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "figures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_figures" (
    "product_id" UUID NOT NULL,
    "figure_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_figures_pkey" PRIMARY KEY ("product_id","figure_id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "part_number" TEXT NOT NULL,
    "name" TEXT,
    "category" TEXT,
    "colour" TEXT,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_parts" (
    "product_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "product_parts_pkey" PRIMARY KEY ("product_id","part_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "terms_url" TEXT,
    "license" TEXT,
    "robots_checked_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_records" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "raw_payload" JSONB,
    "content_hash" TEXT NOT NULL,
    "source_updated_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_values" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_record_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "raw_value" JSONB NOT NULL,
    "normalized_value" JSONB,
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
    "priority" INTEGER NOT NULL,
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'OPEN',
    "selected_value_id" UUID,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_values" (
    "conflict_id" UUID NOT NULL,
    "source_value_id" UUID NOT NULL,

    CONSTRAINT "conflict_values_pkey" PRIMARY KEY ("conflict_id","source_value_id")
);

-- CreateTable
CREATE TABLE "review_tasks" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "review_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "conflicts" INTEGER NOT NULL DEFAULT 0,
    "inaccessible" INTEGER NOT NULL DEFAULT 0,
    "cursor" JSONB,
    "error_summary" JSONB,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "CollectionCondition" NOT NULL DEFAULT 'UNKNOWN',
    "is_complete" BOOLEAN,
    "has_box" BOOLEAN,
    "box_condition" "CollectionCondition",
    "has_instructions" BOOLEAN,
    "purchase_date" DATE,
    "purchase_price" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "notes" TEXT,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" UUID NOT NULL,
    "wishlist_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_canonical_key_key" ON "products"("canonical_key");

-- CreateIndex
CREATE INDEX "products_base_reference_idx" ON "products"("base_reference");

-- CreateIndex
CREATE INDEX "products_release_year_idx" ON "products"("release_year");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_canonical_key_key" ON "product_variants"("canonical_key");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_references_normalized_value_idx" ON "product_references"("normalized_value");

-- CreateIndex
CREATE INDEX "product_references_base_value_idx" ON "product_references"("base_value");

-- CreateIndex
CREATE UNIQUE INDEX "product_references_variant_id_normalized_value_key" ON "product_references"("variant_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "translations_product_id_locale_key" ON "translations"("product_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "themes_slug_key" ON "themes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "markets_code_key" ON "markets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_variant_id_source_url_key" ON "media_assets"("variant_id", "source_url");

-- CreateIndex
CREATE UNIQUE INDEX "instructions_variant_id_document_url_key" ON "instructions"("variant_id", "document_url");

-- CreateIndex
CREATE UNIQUE INDEX "figures_canonical_key_key" ON "figures"("canonical_key");

-- CreateIndex
CREATE UNIQUE INDEX "parts_part_number_key" ON "parts"("part_number");

-- CreateIndex
CREATE UNIQUE INDEX "sources_key_key" ON "sources"("key");

-- CreateIndex
CREATE INDEX "source_records_content_hash_idx" ON "source_records"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "source_records_source_id_external_id_key" ON "source_records"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "source_values_entity_type_entity_id_field_idx" ON "source_values"("entity_type", "entity_id", "field");

-- CreateIndex
CREATE INDEX "conflicts_status_idx" ON "conflicts"("status");

-- CreateIndex
CREATE INDEX "review_tasks_status_kind_idx" ON "review_tasks"("status", "kind");

-- CreateIndex
CREATE INDEX "import_runs_source_id_started_at_idx" ON "import_runs"("source_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_variant_id_key" ON "collection_items"("collection_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_wishlist_id_variant_id_key" ON "wishlist_items"("wishlist_id", "variant_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "themes" ADD CONSTRAINT "themes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_themes" ADD CONSTRAINT "product_themes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_themes" ADD CONSTRAINT "product_themes_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_markets" ADD CONSTRAINT "variant_markets_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructions" ADD CONSTRAINT "instructions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_figures" ADD CONSTRAINT "product_figures_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_figures" ADD CONSTRAINT "product_figures_figure_id_fkey" FOREIGN KEY ("figure_id") REFERENCES "figures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_parts" ADD CONSTRAINT "product_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_values" ADD CONSTRAINT "source_values_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_values" ADD CONSTRAINT "source_values_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "source_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_values" ADD CONSTRAINT "conflict_values_conflict_id_fkey" FOREIGN KEY ("conflict_id") REFERENCES "conflicts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_values" ADD CONSTRAINT "conflict_values_source_value_id_fkey" FOREIGN KEY ("source_value_id") REFERENCES "source_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_fkey" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
