import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import type { SnapshotEntry } from "../lib/recent-catalogue-audit";

const baseUrl = "https://www.koupobol.com";
const snapshotDir = path.join(process.cwd(), "data", "audit");
const monthPattern = /(Janvier|F[ée]vrier|Mars|Avril|Mai|Juin|Juillet|Ao[uû]t|Septembre|Octobre|Novembre|D[ée]cembre)(?:\s+(20\d{2}))?/i;

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "user-agent": "playmobil-collection-papa-audit/1.0 (single controlled snapshot)" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function parseAnnualPage(html: string, year: number): SnapshotEntry[] {
  const $ = cheerio.load(html);
  const entries = new Map<string, SnapshotEntry>();
  $("a[href*='/p']").each((_index, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    const href = $(element).attr("href");
    const match = text.match(/^Playmobil\s+(.+?)\s+(\d{3,8})\s+(.+)$/i);
    if (!href || !match) return;
    const theme = match[1]!;
    const reference = match[2]!;
    const tail = match[3]!;
    const month = tail.match(monthPattern)?.[1] ?? null;
    const name = tail
      .replace(/\s+(?:sortie pr[ée]vue\s+)?(?:Janvier|F[ée]vrier|Mars|Avril|Mai|Juin|Juillet|Ao[uû]t|Septembre|Octobre|Novembre|D[ée]cembre)(?:\s+20\d{2})?.*$/i, "")
      .replace(/\s+[àa] partir de.*$/i, "")
      .replace(/\s+-\d+%.*$/, "")
      .trim();
    entries.set(reference, {
      reference,
      name,
      theme: theme.trim(),
      announcedMonth: month,
      announcedYear: year,
      url: new URL(href, baseUrl).toString(),
    });
  });
  return [...entries.values()].sort((left, right) => left.reference.localeCompare(right.reference, "fr", { numeric: true }));
}

function parseLatestPage(html: string) {
  const $ = cheerio.load(html);
  const entries: Array<{ reference: string; name: string; url: string; position: number }> = [];
  const seen = new Set<string>();
  $("a[href*='/p']").each((_index, element) => {
    const href = $(element).attr("href");
    const text = $(element).text().replace(/\s+/g, " ").trim();
    const reference = text.match(/\b(\d{3,8})\b/)?.[1];
    if (!href || !reference || seen.has(reference) || entries.length >= 50) return;
    seen.add(reference);
    const name = text.replace(new RegExp(`\\s*${reference}\\s*`), " ").replace(/\s+[àa] partir de.*$/i, "").replace(/\s+sortie pr[ée]vue.*$/i, "").trim();
    entries.push({ reference, name, url: new URL(href, baseUrl).toString(), position: entries.length + 1 });
  });
  return entries;
}

async function main() {
  throw new Error("Automated Koupobol fetching is disabled: the published terms require prior permission to reproduce site elements. Use a controlled manual snapshot and catalogue:radar-diff.");
  if (!process.argv.includes("--refresh")) throw new Error("Use --refresh explicitly; normal audits read committed snapshots without network access.");
  const robots = await fetchText(`${baseUrl}/robots.txt`);
  if (/Disallow:\s*\/playmobil-/i.test(robots) || /Disallow:\s*\/les-derniers-playmobil-ajoutes/i.test(robots)) {
    throw new Error("robots.txt disallows an audited path; refusing to continue.");
  }
  const observedAt = new Date().toISOString();
  await mkdir(snapshotDir, { recursive: true });
  for (const year of [2026, 2027]) {
    const sourceUrl = `${baseUrl}/playmobil-${year}/liste-par-theme`;
    const entries = parseAnnualPage(await fetchText(sourceUrl), year);
    await writeFile(path.join(snapshotDir, `koupobol-${year}.json`), `${JSON.stringify({ sourceRole: "DISCOVERY_ONLY", sourceUrl, observedAt, robotsUrl: `${baseUrl}/robots.txt`, robotsObserved: robots.trim(), entries }, null, 2)}\n`);
    console.log(`${year}: ${entries.length} references`);
  }
  const latestUrl = `${baseUrl}/les-derniers-playmobil-ajoutes`;
  const latest = parseLatestPage(await fetchText(latestUrl));
  await writeFile(path.join(snapshotDir, "koupobol-latest.json"), `${JSON.stringify({ sourceRole: "DISCOVERY_ONLY", sourceUrl: latestUrl, observedAt, entries: latest }, null, 2)}\n`);
  console.log(`latest: ${latest.length} references`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
