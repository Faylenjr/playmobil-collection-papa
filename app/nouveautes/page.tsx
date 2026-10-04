import Link from "next/link";
import { DiscoveryProductCard } from "../../components/DiscoveryProductCard";
import { getReleaseWaveYears, getReleaseWaves } from "../../lib/discovery";

export const dynamic = "force-dynamic";

const frenchWaveNames: Record<string, string> = {
  "january-february-2026": "Nouveautés janvier–février 2026",
  "march-2026": "Nouveautés mars 2026",
  "soccer-2026": "Soccer 2026",
  "knights-2026": "Knights 2026",
  "may-2026": "Nouveautés mai 2026",
};

export default async function LatestReleasesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const requested = Number.parseInt((await searchParams).year ?? "", 10);
  const years = await getReleaseWaveYears();
  const year = years.includes(requested) ? requested : years[0];
  const waves = await getReleaseWaves(year);
  return <div className="page-shell listing-page latest-page">
    <section className="page-heading themes-heading">
      <span className="eyebrow">Sources officielles PLAYMOBIL</span>
      <h1>Nouveautés par vagues</h1>
      <p>Les produits sont regroupés uniquement lorsqu’une page officielle les présente ensemble. Une vague est distincte d’un thème ou d’une gamme durable.</p>
    </section>
    <nav className="filter-chips" aria-label="Filtrer les nouveautés par année">
      {years.map((value) => <Link className={value === year ? "active" : ""} href={`/nouveautes?year=${value}`} key={value}>{value}</Link>)}
    </nav>
    {waves.map((wave) => {
      const total = wave.items.length;
      const percentage = total ? Math.round(wave.owned / total * 100) : 0;
      const returnTo = `/nouveautes?year=${wave.releaseYear}#${wave.slug}`;
      return <section className="release-wave" id={wave.slug} key={wave.id}>
        <div className="wave-heading">
          <div><span className="eyebrow">{wave.market.name}</span><h2>{frenchWaveNames[wave.slug] ?? wave.name}</h2><p>{total} références · {wave.owned} possédées · {wave.wanted} recherchées · {wave.missing} manquantes</p></div>
          <strong>{wave.owned} / {total}<small>{percentage} % complété</small></strong>
        </div>
        <div className="progress-track" aria-label={`${percentage} % complété`}><span style={{ width: `${percentage}%` }} /></div>
        <div className="catalogue-grid">
          {wave.items.map((item) => <DiscoveryProductCard key={item.productId} product={{
            id: item.variant.id,
            name: item.variantCount > 1 ? (item.product.name ?? item.variant.displayName) : item.variant.displayName,
            reference: item.observedReference,
            year: item.variant.releaseYear ?? item.variant.product.releaseYear,
            imageUrl: item.variant.media[0]?.sourceUrl ?? null,
            detail: item.variantCount > 1 ? `${item.variantCount} variantes internes` : item.variant.themes[0]?.theme.name ?? null,
          }} inCollection={item.inCollection} inWishlist={item.inWishlist} returnTo={returnTo} />)}
        </div>
        <p className="source-note"><a href={wave.sourceUrl} target="_blank" rel="noreferrer">Voir la vague officielle ↗</a> · observée le {wave.observedAt.toLocaleDateString("fr-FR")}</p>
      </section>;
    })}
    {!waves.length && <section className="empty-state"><h2>Aucune vague officielle documentée pour cette année</h2><p>Le catalogue chronologique reste disponible dans le catalogue général.</p></section>}
  </div>;
}
