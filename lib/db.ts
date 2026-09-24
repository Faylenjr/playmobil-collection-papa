import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  playmobilPrisma?: PrismaClient;
  playmobilPrismaPromise?: Promise<PrismaClient>;
};

export async function getDatabaseClient(): Promise<PrismaClient> {
  if (process.env.PGLITE_DIR) {
    globalForPrisma.playmobilPrismaPromise ??= import("../src/db/embedded").then(
      async ({ createEmbeddedDatabaseClient }) =>
        (await createEmbeddedDatabaseClient(process.env.PGLITE_DIR)).db,
    );
    return globalForPrisma.playmobilPrismaPromise;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client =
    globalForPrisma.playmobilPrisma ??
    new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  if (process.env.NODE_ENV !== "production") globalForPrisma.playmobilPrisma = client;
  return client;
}
