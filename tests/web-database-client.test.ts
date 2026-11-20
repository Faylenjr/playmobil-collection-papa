import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabaseClient } from "../lib/db";

describe("Web database client lifetime", () => {
  const processState = globalThis as typeof globalThis & { playmobilPrisma?: unknown };

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PGLITE_DIR", "");
    vi.stubEnv("DATABASE_URL", "postgresql://fixture:fixture@127.0.0.1:1/fixture");
  });

  afterEach(() => {
    delete processState.playmobilPrisma;
    vi.unstubAllEnvs();
  });

  it("reuses one pool across concurrent production Node requests", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const clients = await Promise.all(Array.from({ length: 16 }, () => getDatabaseClient()));
    expect(new Set(clients).size).toBe(1);
  });

  it("does not share sockets across production Workers requests", async () => {
    vi.stubEnv("NEXT_RUNTIME", "");
    const clients = await Promise.all([getDatabaseClient(), getDatabaseClient()]);
    expect(clients[0]).not.toBe(clients[1]);
  });
});
