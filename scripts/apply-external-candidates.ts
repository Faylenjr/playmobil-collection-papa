import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { candidateObservationKey, deriveCandidateStatus } from "../lib/external-candidates";
import { getNodeDatabaseClient } from "../lib/db-node";

type KoupEntry = { reference: string; name?: string | null; announcedYear?: number | null; announcedMonth?: string | null; url: string };
type CommunityEntry = { reference: string; observedYear?: number | null; url: string };
type OfficialEntry = { reference: string; market: "fr-FR" | "de-DE" | "en-US"; name?: string | null; sourceUrl: string; confirmed: boolean };

const auditPath = (file: string) => path.join(process.cwd(), "data", "audit", file);
async function json<T>(file: string) { return JSON.parse(await readFile(auditPath(file), "utf8")) as T; }

async function main() {
  const apply = process.argv.includes("--apply");
  const [koup2026, koup2027, community2027, official] = await Promise.all([
    json<{ observedAt: string; entries: KoupEntry[] }>("koupobol-2026.json"),
    json<{ observedAt: string; entries: KoupEntry[] }>("koupobol-2027.json"),
    json<{ observedAt: string; entries: CommunityEntry[] }>("elmundoclick-2027.json"),
    json<{ observedAt: string; observations: OfficialEntry[] }>("playmobil-official-import-2026.json"),
  ]);
  const db = getNodeDatabaseClient();
  try {
    const local = await db.product.findMany({ where: { baseReference: { not: null } }, select: { id: true, baseReference: true } });
    const localByReference = new Map(local.flatMap((item) => item.baseReference ? [[item.baseReference, item.id] as const] : []));
    const references = [...new Set([...koup2026.entries, ...koup2027.entries].map((item) => item.reference))];
    const plan = references.flatMap((reference) => {
      const koup = [...koup2026.entries, ...koup2027.entries].find((item) => item.reference === reference)!;
      if (localByReference.has(reference) && !official.observations.some((item) => item.reference === reference && item.confirmed)) return [];
      const community = community2027.entries.filter((item) => item.reference === reference);
      const officialRows = official.observations.filter((item) => item.reference === reference && item.confirmed);
      const evidence = [
        { sourceKey: "koupobol-discovery", announcedYear: koup.announcedYear ?? null, official: false },
        ...community.map((item) => ({ sourceKey: "elmundoclick-community", announcedYear: item.observedYear ?? null, official: false })),
        ...officialRows.map((item) => ({ sourceKey: `playmobil-official-${item.market}`, announcedYear: null, official: true })),
      ];
      return [{ reference, koup, community, officialRows, ...deriveCandidateStatus(evidence, localByReference.has(reference)) }];
    });
    const summary = {
      mode: apply ? "APPLY" : "DRY_RUN",
      candidates: plan.length,
      byStatus: Object.fromEntries([...new Set(plan.map((item) => item.status))].sort().map((status) => [status, plan.filter((item) => item.status === status).length])),
      conflicts: plan.filter((item) => item.status === "CONFLICTING").map((item) => ({ reference: item.reference, reason: item.conflictReason })),
    };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    await db.$transaction(async (tx) => {
      const sources = {
        koup: await tx.source.upsert({ where: { key: "koupobol-discovery" }, update: { enabled: false, termsUrl: "https://www.koupobol.com/pages/conditions-generales-d-utilisation/4" }, create: { key: "koupobol-discovery", name: "Koupobol (radar uniquement)", baseUrl: "https://www.koupobol.com/", kind: "COMMUNITY_EDITORIAL", priority: 200, enabled: false, termsUrl: "https://www.koupobol.com/pages/conditions-generales-d-utilisation/4" } }),
        community: await tx.source.upsert({ where: { key: "elmundoclick-community" }, update: {}, create: { key: "elmundoclick-community", name: "El Mundo Click (corroboration)", baseUrl: "https://www.elmundoclick.com/", kind: "COMMUNITY_EDITORIAL", priority: 210, enabled: false } }),
      };
      const officialSources = new Map<string, { id: string }>();
      for (const market of ["fr-FR", "de-DE", "en-US"] as const) {
        const suffix = market === "fr-FR" ? "fr" : market === "de-DE" ? "de" : "us";
        const source = await tx.source.findUnique({ where: { key: `playmobil-official-${suffix}` }, select: { id: true } });
        if (source) officialSources.set(market, source);
      }
      for (const item of plan) {
        const candidate = await tx.externalCandidate.upsert({
          where: { normalizedReference: item.reference },
          create: { displayReference: item.reference, normalizedReference: item.reference, status: item.status, conflictReason: item.conflictReason, importedProductId: localByReference.get(item.reference) ?? null, firstObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt), lastObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt) },
          update: { displayReference: item.reference, status: item.status, conflictReason: item.conflictReason, importedProductId: localByReference.get(item.reference) ?? null, lastObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt) },
        });
        await tx.externalCandidateObservation.upsert({
          where: { observationKey: candidateObservationKey(item.reference, "koupobol-discovery", item.koup.url) },
          create: { observationKey: candidateObservationKey(item.reference, "koupobol-discovery", item.koup.url), candidateId: candidate.id, sourceId: sources.koup.id, sourceUrl: item.koup.url, observedName: item.koup.name ?? null, announcedYear: item.koup.announcedYear ?? null, announcedMonth: item.koup.announcedMonth ?? null, firstObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt), lastObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt) },
          update: { observedName: item.koup.name ?? null, announcedYear: item.koup.announcedYear ?? null, announcedMonth: item.koup.announcedMonth ?? null, lastObservedAt: new Date(item.koup.announcedYear === 2027 ? koup2027.observedAt : koup2026.observedAt) },
        });
        for (const row of item.community) {
          const key = candidateObservationKey(item.reference, "elmundoclick-community", row.url);
          await tx.externalCandidateObservation.upsert({ where: { observationKey: key }, create: { observationKey: key, candidateId: candidate.id, sourceId: sources.community.id, sourceUrl: row.url, announcedYear: row.observedYear ?? null, firstObservedAt: new Date(community2027.observedAt), lastObservedAt: new Date(community2027.observedAt) }, update: { announcedYear: row.observedYear ?? null, lastObservedAt: new Date(community2027.observedAt) } });
        }
        for (const row of item.officialRows) {
          const source = officialSources.get(row.market);
          if (!source) continue;
          const key = candidateObservationKey(item.reference, `playmobil-official-${row.market}`, row.sourceUrl);
          await tx.externalCandidateObservation.upsert({ where: { observationKey: key }, create: { observationKey: key, candidateId: candidate.id, sourceId: source.id, sourceUrl: row.sourceUrl, observedName: row.name ?? null, firstObservedAt: new Date(official.observedAt), lastObservedAt: new Date(official.observedAt) }, update: { observedName: row.name ?? null, lastObservedAt: new Date(official.observedAt) } });
        }
      }
    }, { timeout: 120_000 });
    console.log(JSON.stringify(summary, null, 2));
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
