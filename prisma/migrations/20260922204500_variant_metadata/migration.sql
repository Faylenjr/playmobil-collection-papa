-- Variant-level facts are additive. Product-level columns and joins remain available
-- for canonical/aggregated values and backwards compatibility.
ALTER TABLE "product_variants"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "release_year" INTEGER,
  ADD COLUMN "discontinued_year" INTEGER,
  ADD COLUMN "format" TEXT,
  ADD COLUMN "width_mm" DECIMAL(10,2),
  ADD COLUMN "height_mm" DECIMAL(10,2),
  ADD COLUMN "depth_mm" DECIMAL(10,2),
  ADD COLUMN "weight_grams" DECIMAL(10,2),
  ADD COLUMN "parts_inventory_complete" BOOLEAN;

CREATE INDEX "product_variants_release_year_idx" ON "product_variants"("release_year");

CREATE TABLE "variant_translations" (
  "id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "locale" VARCHAR(12) NOT NULL,
  "name" TEXT,
  "description" TEXT,
  CONSTRAINT "variant_translations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "variant_translations_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "variant_translations_variant_id_locale_key"
  ON "variant_translations"("variant_id", "locale");

CREATE TABLE "variant_themes" (
  "variant_id" UUID NOT NULL,
  "theme_id" UUID NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "variant_themes_pkey" PRIMARY KEY ("variant_id", "theme_id"),
  CONSTRAINT "variant_themes_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "variant_themes_theme_id_fkey"
    FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "variant_figures" (
  "variant_id" UUID NOT NULL,
  "figure_id" UUID NOT NULL,
  "quantity" INTEGER,
  CONSTRAINT "variant_figures_pkey" PRIMARY KEY ("variant_id", "figure_id"),
  CONSTRAINT "variant_figures_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "variant_figures_figure_id_fkey"
    FOREIGN KEY ("figure_id") REFERENCES "figures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "variant_parts" (
  "variant_id" UUID NOT NULL,
  "part_id" UUID NOT NULL,
  "quantity" INTEGER,
  CONSTRAINT "variant_parts_pkey" PRIMARY KEY ("variant_id", "part_id"),
  CONSTRAINT "variant_parts_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "variant_parts_part_id_fkey"
    FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
