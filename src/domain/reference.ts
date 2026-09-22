export type VariantSignal = "version" | "market" | "edition" | "none";

export interface ParsedReference {
  display: string;
  normalized: string;
  base: string;
  suffix: string | null;
  variantNumber: number | null;
  signal: VariantSignal;
  warnings: string[];
}

const VERSION_SUFFIX = /^(.*?)[vV](\d+)$/;
const NUMERIC_HYPHEN_SUFFIX = /^(\d{3,8})-([A-Za-z][A-Za-z0-9-]*)$/;

/**
 * Conservative parser: only syntaxes we can defend are split. In particular,
 * PM2305D remains a complete base reference rather than guessing that D is a variant.
 */
export function parseReference(input: string): ParsedReference {
  const display = input.trim();
  if (!display) throw new Error("A reference cannot be empty");

  const compact = display
    .normalize("NFKC")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, "");
  const normalized = compact.toUpperCase();
  const warnings: string[] = [];

  const version = normalized.match(VERSION_SUFFIX);
  if (version?.[1] && version[2]) {
    return {
      display,
      normalized,
      base: version[1],
      suffix: `V${version[2]}`,
      variantNumber: Number(version[2]),
      signal: "version",
      warnings,
    };
  }

  const hyphenated = normalized.match(NUMERIC_HYPHEN_SUFFIX);
  if (hyphenated?.[1] && hyphenated[2]) {
    const suffix = hyphenated[2];
    const marketLike = suffix.length > 1 || suffix.includes("-");
    return {
      display,
      normalized,
      base: hyphenated[1],
      suffix,
      variantNumber: null,
      signal: marketLike ? "market" : "edition",
      warnings,
    };
  }

  if (!/^[A-Z0-9-]+$/.test(normalized)) warnings.push("unrecognised-characters");
  return { display, normalized, base: normalized, suffix: null, variantNumber: null, signal: "none", warnings };
}

export function canonicalProductKey(reference: ParsedReference): string {
  return `ref:${reference.base}`;
}

export function canonicalVariantKey(reference: ParsedReference): string {
  return `ref:${reference.normalized}`;
}
