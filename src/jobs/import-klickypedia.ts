import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { PoliteHttpClient } from "../importers/http.js";
import { KLICKYPEDIA, listKlickypediaSetUrls, parseKlickypediaSet } from "../importers/klickypedia.js";
import type { SitemapEntry } from "../importers/types.js";
import { importRecord } from "../pipeline/import-record.js";

export interface KlickypediaImportOptions {
  mode: "sample" | "full" | "batch";
  limit?: number;
  offset?: number;
  resume?: boolean;
}

const REPRESENTATIVE_URLS = [
  "https://www.klickypedia.com/sets/00000-ger-catalogue-1974/",
  "https://www.klickypedia.com/sets/0104-sch-super-deluxe-pirate-ship/",
  "https://www.klickypedia.com/sets/13516-aur-rhino-feeder/",
  "https://www.klickypedia.com/sets/00000-esp-catalogo-2000/",
  "https://www.klickypedia.com/sets/0000-promotional-knigth/",
  "https://www.klickypedia.com/sets/0-gre-catalogue-2020/",
  "https://www.klickypedia.com/sets/00000-fra-paper-bag-playmobil-x-grand-mercredi/",
  "https://www.klickypedia.com/sets/3540-houseboat/",
  "https://www.klickypedia.com/sets/6708-ambulance/",
  "https://www.klickypedia.com/sets/4631-nun/",
  "https://www.klickypedia.com/sets/70733-figuren-series-21-girls/",
  "https://www.klickypedia.com/sets/70733-01-gymnast/",
  "https://www.klickypedia.com/sets/70733-03-queen/",
  "https://www.klickypedia.com/sets/70733-10-french-woman/",
  "https://www.klickypedia.com/sets/5599v2-stewardess/",
  "https://www.klickypedia.com/sets/5458v3-highlander/",
  "https://www.klickypedia.com/sets/70265-fra-pirates/",
  "https://www.klickypedia.com/sets/72378-ita-marc-marquez/",
  "https://www.klickypedia.com/sets/ladlh-samurai/",
  "https://www.klickypedia.com/sets/00000-ger-fun-card-collection-1-2000-space-stickers/",
];

function selectRepresentative(entries: SitemapEntry[], limit: number): SitemapEntry[] {
  const byUrl = new Map(entries.map((entry) => [entry.loc, entry]));
  const selected = new Map<string, SitemapEntry>();
  for (const url of REPRESENTATIVE_URLS) selected.set(url, byUrl.get(url) ?? { loc: url });
  const remaining = Math.max(0, limit - selected.size);
  for (let index = 0; index < remaining; index += 1) {
    const position = Math.floor((index + 0.5) * entries.length / Math.max(1, remaining));
    const entry = entries[Math.min(position, entries.length - 1)];
    if (entry) selected.set(entry.loc, entry);
  }
  if (selected.size < limit) for (const entry of entries) {
    selected.set(entry.loc, entry);
    if (selected.size >= limit) break;
  }
  return [...selected.values()].slice(0, limit);
}

const selectionHash = (entries: SitemapEntry[]) => createHash("sha256").update(entries.map((entry) => `${entry.loc}\t${entry.lastmod ?? ""}`).join("\n")).digest("hex");

export const selectBatchEntries = (entries: SitemapEntry[], offset: number, limit: number) =>
  entries.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(Math.max(limit, 1), 2_000));

export async function runKlickypediaImport(db: PrismaClient, options: KlickypediaImportOptions) {
  const source = await db.source.upsert({
    where: { key: KLICKYPEDIA.key },
    create: { key: KLICKYPEDIA.key, name: KLICKYPEDIA.name, baseUrl: KLICKYPEDIA.baseUrl, kind: "COMMUNITY_DATABASE", priority: KLICKYPEDIA.priority, enabled: true, robotsCheckedAt: new Date() },
    update: { enabled: true, robotsCheckedAt: new Date() },
  });
  const client = new PoliteHttpClient();
  const indexed = await listKlickypediaSetUrls(client);
  const detailEntries = indexed.filter((entry) => new URL(entry.loc).pathname !== "/sets/");
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.mode === "full"
    ? detailEntries.length
    : options.mode === "batch"
      ? Math.min(Math.max(options.limit ?? 1_900, 1), 2_000)
      : Math.min(Math.max(options.limit ?? 200, 1), 300);
  const entries = options.mode === "full"
    ? detailEntries
    : options.mode === "batch"
      ? selectBatchEntries(detailEntries, offset, limit)
      : selectRepresentative(detailEntries, limit);
  const hash = selectionHash(entries);
  const runMode = options.mode === "batch" ? `klickypedia:batch:${offset}:${limit}` : `klickypedia:${options.mode}`;

  const resumable = options.resume ? await db.importRun.findFirst({
    where: { sourceId: source.id, mode: runMode, status: { in: ["RUNNING", "PARTIAL", "FAILED"] } },
    orderBy: { startedAt: "desc" },
  }) : null;
  const savedCursor = resumable?.cursor as { index?: number; selectionHash?: string } | null;
  // A completed PARTIAL run is deliberately restarted: unchanged records are
  // skipped via lastmod/hash while failed URLs are attempted again.
  const canResume = savedCursor?.selectionHash === hash && (savedCursor.index ?? 0) < entries.length;
  const run = canResume && resumable ? await db.importRun.update({ where: { id: resumable.id }, data: { status: "RUNNING", finishedAt: null } }) : await db.importRun.create({
    data: { sourceId: source.id, mode: runMode, cursor: { index: 0, offset, total: entries.length, indexedUrls: indexed.length, detailUrls: detailEntries.length, selectionHash: hash } },
  });
  let index = canResume ? Math.min(savedCursor?.index ?? 0, entries.length) : 0;
  const counters = { scanned: run.scanned, created: run.created, updated: run.updated, unchanged: run.unchanged, errors: run.errors, conflicts: run.conflicts, inaccessible: run.inaccessible };
  const errorSummary: Array<{ url: string; error: string }> = [];
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    for (; index < entries.length && !interrupted; index += 1) {
      const entry = entries[index]!;
      try {
        const externalId = new URL(entry.loc).pathname.replace(/^\/|\/$/g, "");
        const previous = await db.sourceRecord.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId } } });
        if (previous && entry.lastmod && previous.sourceUpdatedAt?.toISOString() === new Date(entry.lastmod).toISOString()) {
          await db.sourceRecord.update({ where: { id: previous.id }, data: { lastSeenAt: new Date(), lastCheckedAt: new Date() } });
          counters.unchanged += 1;
        } else {
          const response = await client.get(entry.loc);
          if (response.status !== 200) {
            counters.inaccessible += 1;
            throw new Error(`HTTP ${response.status}`);
          }
          if (previous?.contentHash === response.hash) {
            await db.sourceRecord.update({ where: { id: previous.id }, data: { lastSeenAt: new Date(), lastCheckedAt: new Date(), sourceUpdatedAt: entry.lastmod ? new Date(entry.lastmod) : previous.sourceUpdatedAt } });
            counters.unchanged += 1;
          } else {
            const item = parseKlickypediaSet(response.body, entry.loc, response.hash);
            if (entry.lastmod) item.sourceUpdatedAt = entry.lastmod;
            const imported = await importRecord(db, item);
            if (previous) counters.updated += 1;
            else counters.created += 1;
            counters.conflicts += imported.conflicts;
          }
        }
      } catch (error) {
        counters.errors += 1;
        if (errorSummary.length < 100) errorSummary.push({ url: entry.loc, error: error instanceof Error ? error.message : String(error) });
      }
      counters.scanned += 1;
      await db.importRun.update({ where: { id: run.id }, data: { ...counters, cursor: { index: index + 1, offset, total: entries.length, indexedUrls: indexed.length, detailUrls: detailEntries.length, selectionHash: hash }, errorSummary } });
      if ((index + 1) % 25 === 0) console.log(JSON.stringify({ runId: run.id, progress: index + 1, total: entries.length, ...counters }));
    }
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }

  const status = interrupted ? "PARTIAL" : counters.errors > 0 ? "PARTIAL" : "SUCCEEDED";
  const completed = await db.importRun.update({ where: { id: run.id }, data: { ...counters, status, finishedAt: new Date(), cursor: { index, offset, total: entries.length, indexedUrls: indexed.length, detailUrls: detailEntries.length, selectionHash: hash }, errorSummary } });
  return { run: completed, indexedUrls: indexed.length, detailUrls: detailEntries.length, selectedUrls: entries.length, offset, errors: errorSummary };
}
