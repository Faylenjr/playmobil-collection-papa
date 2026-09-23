import "dotenv/config";
import { auditSources } from "./source-audit.js";
import { createDatabaseClient } from "./db/client.js";
import { buildCoverageReport } from "./report/coverage.js";
import { listKlickypediaSetUrls } from "./importers/klickypedia.js";
import { runKlickypediaImport } from "./jobs/import-klickypedia.js";
import { runPlaymobilImport } from "./jobs/import-playmobil.js";

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
  case "import:klickypedia": {
    const db = createDatabaseClient();
    const mode = process.argv.includes("--full") ? "full" : "sample";
    const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
    const limit = limitArgument ? Number(limitArgument.split("=")[1]) : undefined;
    try { console.log(JSON.stringify(await runKlickypediaImport(db, { mode, ...(limit ? { limit } : {}), resume: process.argv.includes("--resume") }), null, 2)); }
    finally { await db.$disconnect(); }
    break;
  }
  case "import:playmobil": {
    const db = createDatabaseClient();
    const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
    const referencesArgument = process.argv.find((argument) => argument.startsWith("--references="));
    const localesArgument = process.argv.find((argument) => argument.startsWith("--locales="));
    const locales = localesArgument?.split("=")[1]?.split(",").filter((value): value is "de-DE" | "fr-FR" => value === "de-DE" || value === "fr-FR");
    try { console.log(JSON.stringify(await runPlaymobilImport(db, {
      ...(limitArgument ? { limit: Number(limitArgument.split("=")[1]) } : {}),
      ...(referencesArgument ? { references: referencesArgument.split("=")[1]!.split(",") } : {}),
      ...(locales?.length ? { locales } : {}),
    }), null, 2)); }
    finally { await db.$disconnect(); }
    break;
  }
  default:
    console.error("Usage: pnpm source:audit | pnpm import:klickypedia:index | pnpm import:klickypedia:sample | pnpm import:klickypedia:full | pnpm import:playmobil -- --limit=20 | pnpm report");
    process.exitCode = 1;
}
