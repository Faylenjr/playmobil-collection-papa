import Link from "next/link";
import { CountryFlag, marketDisplayName } from "../../components/CountryFlag";
import { getMarketsOverview } from "../../lib/discovery";

export const dynamic = "force-dynamic";

export default async function CountriesPage() {
  const markets = await getMarketsOverview();
  return <div className="page-shell listing-page">
    <section className="page-heading themes-heading"><span className="eyebrow">Préparer un voyage de collectionneur</span><h1>Pays et éditions locales</h1><p>Retrouvez les éditions spécifiques documentées pour chaque marché, sans leur attribuer une exclusivité non démontrée.</p></section>
    <section className="country-grid">
      {markets.map((market) => <Link href={`/pays/${encodeURIComponent(market.code)}`} className="country-card" key={market.id}>
        <CountryFlag code={market.code} label={marketDisplayName(market.code, market.name)} /><div><h2>{marketDisplayName(market.code, market.name)}</h2><p><strong>{market.editions}</strong> éditions spécifiques</p><small>{market.owned} possédées · {market.wanted} recherchées · {market.total} variantes documentées</small></div>
      </Link>)}
    </section>
  </div>;
}
