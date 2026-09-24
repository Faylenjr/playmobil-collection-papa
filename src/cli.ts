import "dotenv/config";
import { auditSources } from "./source-audit.js";
import { createDatabaseClient } from "./db/client.js";
import { buildCoverageReport } from "./report/coverage.js";
import { listKlickypediaSetUrls } from "./importers/klickypedia.js";
import { runKlickypediaImport } from "./jobs/import-klickypedia.js";
import { runPlaymobilImport } from "./jobs/import-playmobil.js";
import { reclassifyIdentities } from "./jobs/reclassify-identities.js";
import { auditMergedIdentities } from "./jobs/audit-merged-identities.js";
import { repairMergedIdentities } from "./jobs/repair-merged-identities.js";
import { loadMergedRepairPlan } from "./domain/merged-repair-plan.js";
import { enrichSourceMediaProvenance } from "./jobs/enrich-source-media-provenance.js";

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
  case "identities:reclassify": {
    const db = createDatabaseClient();
    try { console.log(JSON.stringify(await reclassifyIdentities(db, process.argv.includes("--apply")), null, 2)); }
    finally { await db.$disconnect(); }
    break;
  }
  case "identities:audit-merged": {
    if (process.argv.includes("--apply")) throw new Error("identities:audit-merged is strictly read-only and has no --apply mode");
    const db = createDatabaseClient();
    try { console.log(JSON.stringify(await auditMergedIdentities(db), null, 2)); }
    finally { await db.$disconnect(); }
    break;
  }
  case "identities:repair-merged": {
    const planFlagIndex = process.argv.findIndex((argument) => argument === "--plan");
    const inlinePlan = process.argv.find((argument) => argument.startsWith("--plan="))?.slice("--plan=".length);
    const planPath = inlinePlan ?? (planFlagIndex >= 0 ? process.argv[planFlagIndex + 1] : undefined);
    if (!planPath || planPath.startsWith("--")) throw new Error("identities:repair-merged requires --plan <audit-report.json>");
    const numberFlag = (name: string): number | undefined => {
      const value = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
      if (value === undefined) return undefined;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid --${name} value: ${value}`);
      return parsed;
    };
    const plan = await loadMergedRepairPlan(planPath);
    const expectedVariants = numberFlag("expect-variants");
    const expectedClusters = numberFlag("expect-clusters");
    const expectedNewVariants = numberFlag("expect-new-variants");
    const expectedCurrentVariants = numberFlag("expect-current-variants");
    const expectedPlanHash = process.argv.find((argument) => argument.startsWith("--expect-plan-hash="))?.split("=")[1];
    const db = createDatabaseClient();
    try {
      console.log(JSON.stringify(await repairMergedIdentities(db, plan, {
        apply: process.argv.includes("--apply"),
        expected: {
          ...(expectedPlanHash ? { planHash: expectedPlanHash } : {}),
          ...(expectedVariants !== undefined ? { variantsToSplit: expectedVariants } : {}),
          ...(expectedClusters !== undefined ? { clustersToMaterialize: expectedClusters } : {}),
          ...(expectedNewVariants !== undefined ? { newVariants: expectedNewVariants } : {}),
          ...(expectedCurrentVariants !== undefined ? { currentVariantCount: expectedCurrentVariants } : {}),
        },
      }), null, 2));
    } finally { await db.$disconnect(); }
    break;
  }
  case "media:enrich-source-provenance": {
    const planFlagIndex = process.argv.findIndex((argument) => argument === "--plan");
    const inlinePlan = process.argv.find((argument) => argument.startsWith("--plan="))?.slice("--plan=".length);
    const planPath = inlinePlan ?? (planFlagIndex >= 0 ? process.argv[planFlagIndex + 1] : undefined);
    if (!planPath || planPath.startsWith("--")) throw new Error("media:enrich-source-provenance requires --plan <audit-report.json>");
    const plan = await loadMergedRepairPlan(planPath);
    const db = createDatabaseClient();
    try {
      console.log(JSON.stringify(await enrichSourceMediaProvenance(db, plan, {
        apply: process.argv.includes("--apply"),
      }), null, 2));
    } finally { await db.$disconnect(); }
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
    console.error("Usage: pnpm source:audit | pnpm import:klickypedia:index | pnpm import:klickypedia:sample | pnpm import:klickypedia:full | pnpm import:playmobil -- --limit=20 | pnpm identities:reclassify -- [--apply] | pnpm identities:audit-merged | pnpm identities:repair-merged -- --plan <report.json> [--apply] | pnpm media:enrich-source-provenance -- --plan <report.json> [--apply] | pnpm report");
    process.exitCode = 1;
}
