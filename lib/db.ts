import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  playmobilPrisma?: PrismaClient;
  playmobilPrismaPromise?: Promise<PrismaClient>;
};

export async function getDatabaseClient(): Promise<PrismaClient> {
  if (process.env.PGLITE_DIR) {
    const clientPromise = (globalForPrisma.playmobilPrismaPromise ??= import("../src/db/embedded").then(
      async ({ createEmbeddedDatabaseClient }) =>
        (await createEmbeddedDatabaseClient(process.env.PGLITE_DIR)).db as unknown as PrismaClient,
    ));
    return clientPromise;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const createClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  // Reuse the connection pool across Next.js Node requests. Keep request-local
  // clients in the Workers build, where socket I/O can be request-bound.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_RUNTIME !== "nodejs") return createClient();
  return (globalForPrisma.playmobilPrisma ??= createClient());
}
