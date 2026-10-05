import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { officialMarketConfig, officialMissing2026References } from "../lib/official-product-import";
import { parseOfficialPageObservation, type OfficialMarket } from "../lib/official-source-audit";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  if (!process.argv.includes("--refresh")) throw new Error("Use --refresh explicitly; this checks only the ten pre-audited official references.");
  const observations: Array<Record<string, unknown>> = [];
  for (const reference of officialMissing2026References) {
    for (const market of Object.keys(officialMarketConfig) as OfficialMarket[]) {
      const sourceUrl = `${officialMarketConfig[market].baseUrl}/${reference}.html`;
      try {
        const response = await fetch(sourceUrl, { headers: { "user-agent": "playmobil-collection-papa-official-import-audit/1.0" } });
        if (!response.ok) observations.push({ reference, market, sourceUrl, httpStatus: response.status, confirmed: false });
        else {
          const parsed = parseOfficialPageObservation(await response.text(), sourceUrl, market);
          observations.push({ httpStatus: response.status, confirmed: parsed.reference === reference, ...parsed });
        }
      } catch (error) {
        observations.push({ reference, market, sourceUrl, httpStatus: null, confirmed: false, error: error instanceof Error ? error.message : String(error) });
      }
      await delay(400);
    }
  }
  const output = path.join(process.cwd(), "data", "audit", "playmobil-official-import-2026.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ sourceRole: "CANONICAL_OFFICIAL_IMPORT", observedAt: new Date().toISOString(), targets: officialMissing2026References, observations }, null, 2)}\n`);
  console.log(JSON.stringify({ output, confirmedReferences: new Set(observations.filter((item) => item.confirmed).map((item) => item.reference)).size }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
