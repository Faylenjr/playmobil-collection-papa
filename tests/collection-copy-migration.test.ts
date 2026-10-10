import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("CollectionCopy migration", () => {
  it("creates one physical row per legacy quantity and only copies metadata once", async () => {
    const database = new PGlite();
    try {
      await database.exec(`
        CREATE TYPE "CollectionCondition" AS ENUM ('SEALED','NEW','EXCELLENT','GOOD','FAIR','POOR','UNKNOWN');
        CREATE TABLE "collection_items" (
          "id" UUID PRIMARY KEY, "quantity" INTEGER NOT NULL DEFAULT 1,
          "condition" "CollectionCondition" NOT NULL DEFAULT 'UNKNOWN',
          "is_complete" BOOLEAN, "has_box" BOOLEAN, "box_condition" "CollectionCondition",
          "has_instructions" BOOLEAN, "purchase_date" DATE, "purchase_price" DECIMAL(12,2),
          "currency" VARCHAR(3), "notes" TEXT
        );
        INSERT INTO "collection_items" VALUES
          ('00000000-0000-0000-0000-000000004359', 3, 'UNKNOWN', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
          ('00000000-0000-0000-0000-000000071371', 1, 'GOOD', TRUE, TRUE, NULL, FALSE, '2026-01-02', 12.50, 'EUR', 'Conservé');
      `);
      const migration = await readFile(join(process.cwd(), "prisma/migrations/20261010120000_collection_copies/migration.sql"), "utf8");
      await database.exec(migration);
      const copies = await database.query<{ collection_item_id: string; condition: string; notes: string | null }>(`SELECT collection_item_id::text, condition::text, notes FROM collection_copies ORDER BY collection_item_id, created_at`);
      expect(copies.rows).toHaveLength(4);
      expect(copies.rows.filter((row) => row.collection_item_id.endsWith("4359"))).toHaveLength(3);
      expect(copies.rows.find((row) => row.collection_item_id.endsWith("71371"))).toMatchObject({ condition: "GOOD", notes: "Conservé" });
    } finally {
      await database.close();
    }
  });
});
