const marketCountries: Record<string, { name: string; flag: string }> = {
  GERMANY: { name: "Allemagne", flag: "de" },
  FRANCE: { name: "France", flag: "fr" },
  ITALY: { name: "Italie", flag: "it" },
  NETHERLANDS: { name: "Pays-Bas", flag: "nl" },
  BELGIUM: { name: "Belgique", flag: "be" },
  "USA-PLAYMOBIL": { name: "États-Unis", flag: "us" },
  "SPAIN-PLAYMOBIL": { name: "Espagne", flag: "es" },
  "UK-PLAYMOBIL": { name: "Royaume-Uni", flag: "gb" },
};

export function marketDisplayName(code: string, fallback: string) {
  return marketCountries[code]?.name ?? fallback;
}

export function CountryFlag({ code, label, large = false }: { code: string; label: string; large?: boolean }) {
  const flag = marketCountries[code]?.flag;
  if (!flag) return null;
  return <span className={`country-flag${large ? " large" : ""}`} role="img" aria-label={`Drapeau : ${label}`}><img src={`/flags/${flag}.svg`} alt="" /></span>;
}
