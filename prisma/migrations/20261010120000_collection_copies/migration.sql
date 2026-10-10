CREATE TABLE "collection_copies" (
    "id" UUID NOT NULL,
    "collection_item_id" UUID NOT NULL,
    "condition" "CollectionCondition" NOT NULL DEFAULT 'UNKNOWN',
    "is_complete" BOOLEAN,
    "has_box" BOOLEAN,
    "box_condition" "CollectionCondition",
    "has_instructions" BOOLEAN,
    "purchase_date" DATE,
    "purchase_price" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_copies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "collection_copies_collection_item_id_created_at_idx"
ON "collection_copies"("collection_item_id", "created_at");

ALTER TABLE "collection_copies"
ADD CONSTRAINT "collection_copies_collection_item_id_fkey"
FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "collection_copies" (
  "id", "collection_item_id", "condition", "is_complete", "has_box",
  "box_condition", "has_instructions", "purchase_date", "purchase_price",
  "currency", "notes", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  item."id",
  CASE WHEN series."copy_number" = 1 THEN item."condition" ELSE 'UNKNOWN'::"CollectionCondition" END,
  CASE WHEN series."copy_number" = 1 THEN item."is_complete" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."has_box" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."box_condition" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."has_instructions" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."purchase_date" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."purchase_price" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."currency" ELSE NULL END,
  CASE WHEN series."copy_number" = 1 THEN item."notes" ELSE NULL END,
  CURRENT_TIMESTAMP + ((series."copy_number" - 1) * INTERVAL '1 millisecond'),
  CURRENT_TIMESTAMP + ((series."copy_number" - 1) * INTERVAL '1 millisecond')
FROM "collection_items" item
CROSS JOIN LATERAL generate_series(1, GREATEST(item."quantity", 1)) AS series("copy_number");

DO $$
DECLARE
  expected_count BIGINT;
  actual_count BIGINT;
  empty_groups BIGINT;
BEGIN
  SELECT COALESCE(SUM(GREATEST("quantity", 1)), 0) INTO expected_count FROM "collection_items";
  SELECT COUNT(*) INTO actual_count FROM "collection_copies";
  SELECT COUNT(*) INTO empty_groups
  FROM "collection_items" item
  WHERE NOT EXISTS (
    SELECT 1 FROM "collection_copies" copy WHERE copy."collection_item_id" = item."id"
  );

  IF actual_count <> expected_count OR empty_groups <> 0 THEN
    RAISE EXCEPTION 'CollectionCopy backfill failed: expected %, got %, empty groups %', expected_count, actual_count, empty_groups;
  END IF;
END $$;
