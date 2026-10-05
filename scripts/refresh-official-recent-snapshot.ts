import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "../generated/prisma-node/client";
import { getDatabaseClient } from "../lib/db";
import { official2026References } from "../lib/official-release-waves";
import { parseOfficialPageObservation, type OfficialMarket } from "../lib/official-source-audit";
import type { LocalReference, SnapshotEntry } from "../lib/recent-catalogue-audit";

const snapshotDir = path.join(process.cwd(), "data", "audit");
const marketUrls: Record<OfficialMarket, string> = {
  "fr-FR": "https://www.playmobil.com/fr-fr",
  "de-DE": "https://www.playmobil.com/de-de",
  "en-US": "https://www.playmobil.com/en-us",
};

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function entries(file: string) {
  return (JSON.parse(await readFile(path.join(snapshotDir, file), "utf8")) as { entries: SnapshotEntry[] }).entries;
}

async function main() {
  if (!process.argv.includes("--refresh")) throw new Error("Use --refresh explicitly; this performs controlled official page checks.");
  const db = await getDatabaseClient();
  try {
    const local = await db.$queryRaw<Pick<LocalReference, "baseValue" | "normalizedValue">[]>(Prisma.sql`
      SELECT pr."base_value" AS "baseValue", pr."normalized_value" AS "normalizedValue" FROM "product_references" pr
    `);
    const localBases = new Set(local.map((row) => row.baseValue ?? row.normalizedValue));
    const annual = [...await entries("koupobol-2026.json"), ...await entries("koupobol-2027.json")];
    const latest = (JSON.parse(await readFile(path.join(snapshotDir, "koupobol-latest.json"), "utf8")) as { entries: Array<{ reference: string }> }).entries;
    const discoveryCandidates = [...annual, ...latest].filter((entry) => !localBases.has(entry.reference)).map((entry) => entry.reference);
    const targets = [...new Set([...official2026References, ...discoveryCandidates])].sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
    const observations: Array<Record<string, unknown> & { reference: string; market: OfficialMarket; sourceUrl: string; confirmed: boolean }> = [];
    for (const reference of targets) {
      for (const market of Object.keys(marketUrls) as OfficialMarket[]) {
        const sourceUrl = `${marketUrls[market]}/${reference}.html`;
        try {
          const response = await fetch(sourceUrl, { headers: { "user-agent": "playmobil-collection-papa-audit/1.0 (controlled official verification)" } });
          if (!response.ok) {
            observations.push({ reference, market, sourceUrl, httpStatus: response.status, confirmed: false });
          } else {
            const parsed = parseOfficialPageObservation(await response.text(), sourceUrl, market);
            observations.push({ httpStatus: response.status, confirmed: parsed.reference === reference, ...parsed });
          }
        } catch (error) {
          observations.push({ reference, market, sourceUrl, httpStatus: null, confirmed: false, error: error instanceof Error ? error.message : String(error) });
        }
        await delay(350);
      }
    }
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(path.join(snapshotDir, "playmobil-official-recent.json"), `${JSON.stringify({ sourceRole: "CANONICAL_VERIFICATION", observedAt: new Date().toISOString(), targets, observations }, null, 2)}\n`);
    console.log(JSON.stringify({ targets: targets.length, confirmedReferences: new Set(observations.filter((row) => row.confirmed).map((row) => row.reference)).size, officialPrices: observations.filter((row) => row.confirmed && Boolean(row.officialPrice)).length }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
