import "dotenv/config";
import { auditSources } from "./source-audit.js";
import { createDatabaseClient } from "./db/client.js";
import { buildCoverageReport } from "./report/coverage.js";
import { listKlickypediaSetUrls } from "./importers/klickypedia.js";

const command = process.argv[2];

switch (command) {
  case "source:audit":
    console.log(JSON.stringify(await auditSources(), null, 2));
    break;
  case "import:klickypedia-index": {
    const entries = await listKlickypediaSetUrls();
    console.log(JSON.stringify({ source: "klickypedia", indexedUrls: entries.length, first: entries.slice(0, 3), last: entries.slice(-3) }, null, 2));
    break;
  }
  case "report": {
    const db = createDatabaseClient();
    try { console.log(JSON.stringify(await buildCoverageReport(db), null, 2)); }
    finally { await db.$disconnect(); }
    break;
  }
  default:
    console.error("Usage: pnpm source:audit | pnpm import:klickypedia:index | pnpm report");
    process.exitCode = 1;
}
