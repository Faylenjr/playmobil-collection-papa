import type { PrismaClient } from "../../generated/prisma/client.js";
import { PoliteHttpClient } from "../importers/http.js";
import { parsePlaymobilProduct, PLAYMOBIL_DE, PLAYMOBIL_FR } from "../importers/playmobil.js";
import { importRecord } from "../pipeline/import-record.js";

export interface PlaymobilImportOptions {
  locales?: Array<"de-DE" | "fr-FR">;
  limit?: number;
  references?: string[];
}

const configs = {
  "de-DE": PLAYMOBIL_DE,
  "fr-FR": PLAYMOBIL_FR,
} as const;

/** Enriches known numeric references; it does not use official pages as a catalogue index. */
export async function runPlaymobilImport(db: PrismaClient, options: PlaymobilImportOptions = {}) {
  const locales = options.locales ?? ["de-DE", "fr-FR"];
  const known = options.references ?? (await db.productReference.findMany({
    where: { normalizedValue: { not: { startsWith: "0" } } },
    distinct: ["normalizedValue"], orderBy: { normalizedValue: "asc" },
    select: { normalizedValue: true }, take: Math.max(1, options.limit ?? 20),
  })).map((row) => row.normalizedValue).filter((reference) => /^\d{4,8}$/.test(reference));
  const references = [...new Set(known)].slice(0, Math.max(1, options.limit ?? known.length));
  const client = new PoliteHttpClient();
  const results: Array<{ locale: string; reference: string; status: string; error?: string }> = [];

  for (const locale of locales) {
    const config = configs[locale];
    const source = await db.source.upsert({
      where: { key: config.key },
      create: { key: config.key, name: config.name, baseUrl: config.baseUrl, kind: "OFFICIAL", priority: config.priority, enabled: true, robotsCheckedAt: new Date() },
      update: { enabled: true, robotsCheckedAt: new Date() },
    });
    const run = await db.importRun.create({ data: { sourceId: source.id, mode: `playmobil:${locale}:enrichment`, cursor: { index: 0, total: references.length } } });
    const counters = { scanned: 0, created: 0, updated: 0, unchanged: 0, errors: 0, conflicts: 0, inaccessible: 0 };
    const failures: Array<{ reference: string; error: string }> = [];

    for (let index = 0; index < references.length; index += 1) {
      const reference = references[index]!;
      const url = `${config.baseUrl}/${encodeURIComponent(reference)}.html`;
      try {
        const previous = await db.sourceRecord.findUnique({ where: { sourceId_externalId: { sourceId: source.id, externalId: reference } } });
        const response = await client.get(url);
        counters.scanned += 1;
        if (response.status !== 200 || !response.body.includes(reference)) {
          counters.inaccessible += 1;
          results.push({ locale, reference, status: `HTTP ${response.status}` });
        } else if (previous?.contentHash === response.hash) {
          await db.sourceRecord.update({ where: { id: previous.id }, data: { lastSeenAt: new Date(), lastCheckedAt: new Date() } });
          counters.unchanged += 1;
          results.push({ locale, reference, status: "unchanged" });
        } else {
          const parsed = parsePlaymobilProduct(response.body, url, locale);
          parsed.contentHash = response.hash;
          const imported = await importRecord(db, parsed);
          if (previous) counters.updated += 1; else counters.created += 1;
          counters.conflicts += imported.conflicts;
          results.push({ locale, reference, status: previous ? "updated" : "created" });
        }
      } catch (error) {
        counters.scanned += 1; counters.errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ reference, error: message });
        results.push({ locale, reference, status: "error", error: message });
      }
      await db.importRun.update({ where: { id: run.id }, data: { ...counters, cursor: { index: index + 1, total: references.length }, errorSummary: failures } });
    }
    await db.importRun.update({ where: { id: run.id }, data: { ...counters, status: counters.errors || counters.inaccessible ? "PARTIAL" : "SUCCEEDED", finishedAt: new Date(), errorSummary: failures } });
  }
  return { references, locales, results };
}
