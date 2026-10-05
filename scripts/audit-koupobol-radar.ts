import { readFile } from "node:fs/promises";
import path from "node:path";

type Snapshot = { entries: Array<{ reference: string; name?: string | null; announcedYear?: number | null }> };

function argument(name: string) { return process.argv.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  const incomingPath = argument("--snapshot");
  if (!incomingPath) throw new Error("Automated Koupobol fetching is disabled. Supply a manually obtained, permission-compatible snapshot with --snapshot=<path>.");
  const baseline = JSON.parse(await readFile(path.join(process.cwd(), "data", "audit", "koupobol-latest.json"), "utf8")) as Snapshot;
  const incoming = JSON.parse(await readFile(path.resolve(incomingPath), "utf8")) as Snapshot;
  const before = new Map(baseline.entries.map((item) => [item.reference, item]));
  const after = new Map(incoming.entries.map((item) => [item.reference, item]));
  const added = [...after.keys()].filter((reference) => !before.has(reference));
  const disappeared = [...before.keys()].filter((reference) => !after.has(reference));
  const changedNames = [...after].flatMap(([reference, item]) => before.has(reference) && before.get(reference)?.name !== item.name ? [{ reference, before: before.get(reference)?.name ?? null, after: item.name ?? null }] : []);
  const changedYears = [...after].flatMap(([reference, item]) => before.has(reference) && before.get(reference)?.announcedYear !== item.announcedYear ? [{ reference, before: before.get(reference)?.announcedYear ?? null, after: item.announcedYear ?? null }] : []);
  console.log(JSON.stringify({ mode: "OFFLINE_MANUAL_SNAPSHOT_DIFF", added, disappeared, changedNames, changedYears }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
