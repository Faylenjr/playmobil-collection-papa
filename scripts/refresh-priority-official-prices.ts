import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getNodeDatabaseClient } from "../lib/db-node";
import { parseOfficialPageObservation, type OfficialMarket } from "../lib/official-source-audit";
import { selectOfficialPriceTargets } from "../lib/official-price-targets-node";

const refresh = process.argv.includes("--refresh");
const limit = Math.min(250, Math.max(1, Number.parseInt(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "120", 10) || 120));
const marketUrls: Record<"fr-FR" | "de-DE", string> = { "fr-FR": "https://www.playmobil.com/fr-fr", "de-DE": "https://www.playmobil.com/de-de" };
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const db = getNodeDatabaseClient();
  try {
    const plan = await selectOfficialPriceTargets(db, { limit });
    const summary = { mode: refresh ? "REFRESH" : "DRY_RUN", limit, targets: plan.selected.length, candidates: plan.candidates, selectedByReason: plan.selectedByReason, intersections: plan.intersections };
    if (!refresh) { console.log(JSON.stringify(summary, null, 2)); return; }
    const observations: Array<Record<string, unknown>> = [];
    for (const { variant, reason } of plan.selected) {
      const reference = variant.references[0]?.baseValue ?? variant.references[0]?.normalizedValue;
      if (!reference) continue;
      for (const market of Object.keys(marketUrls) as Array<keyof typeof marketUrls>) {
        const sourceUrl = `${marketUrls[market]}/${reference}.html`;
        try {
          const response = await fetch(sourceUrl, { headers: { "user-agent": "playmobil-collection-papa-price-audit/1.0 (controlled official verification)" } });
          if (!response.ok) observations.push({ variantId: variant.id, reason, reference, market, sourceUrl, httpStatus: response.status, confirmed: false });
          else {
            const parsed = parseOfficialPageObservation(await response.text(), sourceUrl, market as OfficialMarket);
            observations.push({ variantId: variant.id, reason, httpStatus: response.status, confirmed: parsed.reference === reference, ...parsed });
          }
        } catch (error) {
          observations.push({ variantId: variant.id, reason, reference, market, sourceUrl, httpStatus: null, confirmed: false, error: error instanceof Error ? error.message : String(error) });
        }
        await delay(250);
      }
    }
    const observedAt = new Date().toISOString();
    const output = path.join(process.cwd(), "data", "audit", "playmobil-official-priority-prices.json");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify({ sourceRole: "CANONICAL_OFFICIAL_PRICE", observedAt, plan: summary, observations }, null, 2)}\n`);
    console.log(JSON.stringify({ ...summary, observations: observations.length, confirmed: observations.filter((row) => row.confirmed).length, prices: observations.filter((row) => row.confirmed && row.officialPrice).length, archivedPrices: observations.filter((row) => row.confirmed && row.officialPrice && row.isArchived).length, output }, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
