import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma-node/client";

const globalForNodePrisma = globalThis as unknown as {
  playmobilNodePrisma?: PrismaClient;
};

export function getNodeDatabaseClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client =
    globalForNodePrisma.playmobilNodePrisma ??
    new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  if (process.env.NODE_ENV !== "production") {
    globalForNodePrisma.playmobilNodePrisma = client;
  }

  return client;
}
