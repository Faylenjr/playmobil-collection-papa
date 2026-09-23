import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "../../generated/prisma/client.js";

/**
 * Workspace/CI fallback when a PostgreSQL daemon or Docker is unavailable.
 * PGlite is PostgreSQL compiled to WASM; production continues to use PrismaPg.
 */
export async function createEmbeddedDatabaseClient(dataDir = process.env.PGLITE_DIR ?? "./.data/pglite") {
  await mkdir(resolve(dataDir, ".."), { recursive: true });
  const database = new PGlite({ dataDir });
  await database.waitReady;
  await database.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const migrationsRoot = resolve("prisma/migrations");
  const migrations = (await readdir(migrationsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of migrations) {
    const applied = await database.query<{ name: string }>("SELECT name FROM _local_migrations WHERE name = $1", [name]);
    if (applied.rows.length) continue;
    await database.transaction(async (transaction) => {
      await transaction.exec(await readFile(resolve(migrationsRoot, name, "migration.sql"), "utf8"));
      await transaction.query("INSERT INTO _local_migrations(name) VALUES ($1)", [name]);
    });
  }
  return { db: new PrismaClient({ adapter: new PrismaPGlite(database) }), database };
}
