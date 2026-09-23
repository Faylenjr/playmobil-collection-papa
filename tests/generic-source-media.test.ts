import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmbeddedDatabaseClient } from "../src/db/embedded.js";
import {
  KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL,
  classifySourceMedia,
  isGenericSourceMedia,
} from "../src/domain/source-media.js";
import { importRecord } from "../src/pipeline/import-record.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("generic source media", () => {
  it("recognizes only the single proven exact URL", () => {
    expect(classifySourceMedia(KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL)).toBe("GENERIC_SOURCE_FALLBACK");
    expect(isGenericSourceMedia(`${KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL}?variant=1`)).toBe(false);
    expect(isGenericSourceMedia("https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.png")).toBe(false);
    expect(isGenericSourceMedia("https://cdn.example/logo-klickypedia-click.jpg")).toBe(false);
  });

  it("defensively refuses to materialize the fallback even when a caller bypasses the parser", async () => {
    const directory = await mkdtemp(join(tmpdir(), "playmobil-generic-media-"));
    directories.push(directory);
    const { db, database } = await createEmbeddedDatabaseClient(directory);
    try {
      await db.source.create({ data: {
        key: "klickypedia", name: "Klickypedia", baseUrl: "https://www.klickypedia.com", kind: "COMMUNITY_DATABASE",
      } });
      const realUrl = "https://www.klickypedia.com/wp-content/uploads/70733-real.jpg";
      await importRecord(db, {
        source: "klickypedia",
        externalId: "sets/70733v1-gymnast",
        sourceUrl: "https://www.klickypedia.com/sets/70733v1-gymnast/",
        reference: "70733v1",
        name: "Gymnast",
        images: [
          { kind: "main", url: KLICKYPEDIA_GENERIC_SOURCE_FALLBACK_URL },
          { kind: "gallery", url: realUrl },
        ],
        raw: { test: true },
      });

      expect(await db.mediaAsset.findMany({ select: { sourceUrl: true } })).toEqual([{ sourceUrl: realUrl }]);
    } finally {
      await db.$disconnect();
      await database.close();
    }
  });
});
