import { marketCountries, marketDisplayName } from "../lib/country-markets";

export { marketDisplayName };

export function CountryFlag({ code, label, large = false }: { code: string; label: string; large?: boolean }) {
  const flag = marketCountries[code]?.flag;
  if (!flag) return null;
  return <span className={`country-flag${large ? " large" : ""}`} role="img" aria-label={`Drapeau : ${label}`}><img src={`/flags/${flag}.svg`} alt="" /></span>;
}
