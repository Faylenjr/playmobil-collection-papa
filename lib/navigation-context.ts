const allowedReturnPaths = new Set([
  "/catalogue",
  "/collection",
  "/nouveautes",
  "/recherches",
  "/themes",
]);
const allowedReturnPrefixes = ["/pays/", "/collections-speciales/"];

export type SearchParamRecord = Record<string, string | string[] | undefined>;

export function buildInternalUrl(pathname: string, params: SearchParamRecord, overrides: Record<string, string | number | null | undefined> = {}) {
  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "returnTo") continue;
    for (const value of Array.isArray(rawValue) ? rawValue : rawValue === undefined ? [] : [rawValue]) {
      if (value !== "") search.append(key, value);
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    search.delete(key);
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const suffix = search.toString();
  return `${pathname}${suffix ? `?${suffix}` : ""}`;
}

export function sanitizeReturnTo(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/catalogue";
  try {
    const parsed = new URL(candidate, "https://playmobil.local");
    if (parsed.origin !== "https://playmobil.local" || (!allowedReturnPaths.has(parsed.pathname) && !allowedReturnPrefixes.some((prefix) => parsed.pathname.startsWith(prefix)))) return "/catalogue";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/catalogue";
  }
}

export function productHref(variantId: string, returnTo?: string) {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  return `/sets/${encodeURIComponent(variantId)}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function returnLabel(returnTo: string) {
  if (returnTo.startsWith("/collection")) return "Retour à ma collection";
  if (returnTo.startsWith("/recherches")) return "Retour à mes recherches";
  if (returnTo.startsWith("/nouveautes")) return "Retour aux nouveautés";
  if (returnTo.startsWith("/themes")) return "Retour aux thèmes";
  if (returnTo.startsWith("/pays")) return "Retour au pays";
  if (returnTo.startsWith("/collections-speciales")) return "Retour à la collection spéciale";
  return "Retour au catalogue";
}
