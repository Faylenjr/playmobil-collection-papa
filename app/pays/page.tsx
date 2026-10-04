import Link from "next/link";
import { getMarketsOverview } from "../../lib/discovery";

export const dynamic = "force-dynamic";

const flags: Record<string, string> = { GERMANY: "🇩🇪", FRANCE: "🇫🇷", ITALY: "🇮🇹", NETHERLANDS: "🇳🇱", BELGIUM: "🇧🇪", "USA-PLAYMOBIL": "🇺🇸", "SPAIN-PLAYMOBIL": "🇪🇸", "UK-PLAYMOBIL": "🇬🇧" };
const names: Record<string, string> = { GERMANY: "Allemagne", FRANCE: "France", ITALY: "Italie", NETHERLANDS: "Pays-Bas", BELGIUM: "Belgique", "USA-PLAYMOBIL": "États-Unis", "SPAIN-PLAYMOBIL": "Espagne", "UK-PLAYMOBIL": "Royaume-Uni" };

export default async function CountriesPage() {
  const markets = await getMarketsOverview();
  return <div className="page-shell listing-page">
    <section className="page-heading themes-heading"><span className="eyebrow">Préparer un voyage de collectionneur</span><h1>Pays et éditions locales</h1><p>Une édition de marché n’est pas automatiquement une exclusivité. Les deux niveaux sont comptés et affichés séparément.</p></section>
    <section className="country-grid">
      {markets.map((market) => <Link href={`/pays/${encodeURIComponent(market.code)}`} className="country-card" key={market.id}>
        <span>{flags[market.code] ?? "🌍"}</span><div><h2>{names[market.code] ?? market.name}</h2><p><strong>{market.exclusive}</strong> exclusivités signalées</p><p><strong>{market.editions}</strong> éditions spécifiques</p><small>{market.owned} possédées · {market.wanted} recherchées · {market.total} documentées</small></div>
      </Link>)}
    </section>
  </div>;
}
