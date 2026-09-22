import { load } from "cheerio";
import type { RawCollectible } from "./types.js";

export const PLAYMODB = { key: "playmodb", name: "PlaymoDB", baseUrl: "https://playmodb.org", priority: 20 } as const;

export interface PlaymoDbStats { sets: number; parts: number; inventoriedSets: number; figures: number }

export function parsePlaymoDbStats(html: string): PlaymoDbStats {
  const text = load(html)("body").text().replace(/\s+/g, " ");
  const sets = text.match(/Sets:\s*now\s*(\d+)\s*sets/i)?.[1];
  const parts = text.match(/Parts:\s*now\s*(\d+)\s*parts.*?appearing in\s*(\d+)\s*sets/i);
  const figures = text.match(/Who.s that Klicky\?\s*now\s*(\d+)\s*klickies/i)?.[1];
  if (!sets || !parts?.[1] || !parts[2] || !figures) throw new Error("Unrecognised PlaymoDB statistics page");
  return { sets: Number(sets), parts: Number(parts[1]), inventoriedSets: Number(parts[2]), figures: Number(figures) };
}

export function parsePlaymoDbSet(html: string, sourceUrl: string): RawCollectible {
  const $ = load(html);
  const text = $("body").text().replace(/\s+/g, " ");
  const reference = text.match(/Set\s*(?:number|#)?\s*:?\s*([A-Za-z0-9-]+)/i)?.[1];
  if (!reference) throw new Error(`Missing PlaymoDB set number: ${sourceUrl}`);
  const title = $("h1, h2, title").first().text().replace(/\s+/g, " ").trim();
  const year = text.match(/(?:Year|Released)\s*:?\s*((?:19|20)\d{2})/i)?.[1];
  return {
    source: PLAYMODB.key,
    externalId: reference,
    sourceUrl,
    reference,
    ...(title ? { name: title } : {}),
    ...(year ? { releaseYear: Number(year) } : {}),
    raw: { title },
  };
}
