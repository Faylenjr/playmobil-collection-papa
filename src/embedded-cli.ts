import "dotenv/config";
import { createEmbeddedDatabaseClient } from "./db/embedded.js";
import { runKlickypediaImport } from "./jobs/import-klickypedia.js";
import { buildCoverageReport } from "./report/coverage.js";
import { runPlaymobilImport } from "./jobs/import-playmobil.js";

const command = process.argv[2];
const { db, database } = await createEmbeddedDatabaseClient();
try {
  if (command === "import:klickypedia") {
    const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
    const limit = limitArgument ? Number(limitArgument.split("=")[1]) : 200;
    console.log(JSON.stringify(await runKlickypediaImport(db, { mode: "sample", limit, resume: process.argv.includes("--resume") }), null, 2));
  } else if (command === "report") {
    console.log(JSON.stringify(await buildCoverageReport(db), null, 2));
  } else if (command === "import:playmobil") {
    const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
    const referencesArgument = process.argv.find((argument) => argument.startsWith("--references="));
    console.log(JSON.stringify(await runPlaymobilImport(db, {
      ...(limitArgument ? { limit: Number(limitArgument.split("=")[1]) } : {}),
      ...(referencesArgument ? { references: referencesArgument.split("=")[1]!.split(",") } : {}),
    }), null, 2));
  } else {
    throw new Error("Usage: embedded-cli import:klickypedia --limit=200 --resume | embedded-cli import:playmobil --limit=20 | embedded-cli report");
  }
} finally {
  await db.$disconnect();
  await database.close();
}
