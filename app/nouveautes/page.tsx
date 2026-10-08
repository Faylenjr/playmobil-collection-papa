import Link from "next/link";
import { DiscoveryProductCard } from "../../components/DiscoveryProductCard";
import { getRecentCommercialProducts, getUpcomingCandidates } from "../../lib/collector-insights";
import { getReleaseWaveYears, getReleaseWaves } from "../../lib/discovery";

export const dynamic = "force-dynamic";

const frenchWaveNames: Record<string, string> = {
  "january-february-2026": "Nouveautés janvier–février 2026", "march-2026": "Nouveautés mars 2026", "soccer-2026": "Soccer 2026", "knights-2026": "Knights 2026", "may-2026": "Nouveautés mai 2026",
};
const candidateLabels = { DISCOVERED: "Non confirmé", CORROBORATED: "Corroboré", OFFICIAL_CONFIRMED: "Confirmé officiel", CONFLICTING: "Année contradictoire", REJECTED: "Rejeté", IMPORTED: "Importé" } as const;

export default async function LatestReleasesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const requested = Number.parseInt((await searchParams).year ?? "", 10);
  const waveYears = await getReleaseWaveYears();
  const year = Number.isFinite(requested) ? requested : waveYears[0] ?? 2026;
  const [waves, recent, candidates] = await Promise.all([getReleaseWaves(year), year <= 2026 ? getRecentCommercialProducts(year, 36) : Promise.resolve([]), getUpcomingCandidates(2027)]);
  const monthGroups = new Map<string, typeof recent>();
  for (const item of recent) {
    const label = item.releaseDate ? item.releaseDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "Date précise non documentée";
    const group = monthGroups.get(label) ?? []; group.push(item); monthGroups.set(label, group);
  }
  return <div className="page-shell listing-page latest-page">
    <section className="page-heading themes-heading"><span className="eyebrow">Catalogue récent et sources officielles</span><h1>Nouveautés Playmobil</h1><p>Les dates précises, vagues officielles et produits seulement détectés sont séparés pour ne jamais présenter une information incertaine comme acquise.</p></section>
    <nav className="filter-chips" aria-label="Filtrer les nouveautés par année">{[...new Set([...waveYears, 2027])].sort((a, b) => b - a).map((value) => <Link className={value === year ? "active" : ""} href={`/nouveautes?year=${value}`} key={value}>{value}</Link>)}</nav>
    {waves.length > 0 && <section className="latest-section"><div className="section-title"><div><span className="eyebrow">Regroupements attestés</span><h2>Vagues officielles {year}</h2><p>Ces produits ont été présentés ensemble par PLAYMOBIL.</p></div></div>{waves.map((wave) => {
      const percentage = wave.items.length ? Math.round(wave.owned / wave.items.length * 100) : 0;
      const returnTo = `/nouveautes?year=${wave.releaseYear}#${wave.slug}`;
      return <section className="release-wave" id={wave.slug} key={wave.id}><div className="wave-heading"><div><span className="eyebrow">{wave.market.name}</span><h3>{frenchWaveNames[wave.slug] ?? wave.name}</h3><p>{wave.items.length} références · {wave.owned} possédées · {wave.wanted} recherchées · {wave.missing} manquantes</p></div><strong>{wave.owned} / {wave.items.length}<small>{percentage} % complété</small></strong></div><div className="progress-track" aria-label={`${percentage} % complété`}><span style={{ width: `${percentage}%` }} /></div><div className="catalogue-grid">{wave.items.map((item) => <DiscoveryProductCard key={item.productId} product={{ id: item.variant.id, name: item.variantCount > 1 ? (item.product.name ?? item.variant.displayName) : item.variant.displayName, reference: item.observedReference, year: item.variant.releaseYear ?? item.variant.product.releaseYear, imageUrl: item.variant.media[0]?.sourceUrl ?? null, detail: item.variantCount > 1 ? `${item.variantCount} variantes internes` : item.variant.themes[0]?.theme.name ?? null }} inCollection={item.inCollection} inWishlist={item.inWishlist} returnTo={returnTo} />)}</div><p className="source-note"><a href={wave.sourceUrl} target="_blank" rel="noreferrer">Voir la vague officielle ↗</a> · observée le {wave.observedAt.toLocaleDateString("fr-FR")}</p></section>;
    })}</section>}
    {recent.length > 0 && <section className="latest-section"><div className="section-title"><div><span className="eyebrow">Catalogue individuel</span><h2>Sorties référencées en {year}</h2><p>Un mois n’est affiché que lorsqu’une date précise existe. Les vagues officielles ci-dessus restent la source la plus précise.</p></div><Link href={`/catalogue?year=${year}&sort=recent`}>Voir tout le catalogue {year} →</Link></div>{[...monthGroups].map(([label, items]) => <div className="recent-month" key={label}><h3>{label}</h3><div className="catalogue-grid">{items.map(({ variant, status }) => <DiscoveryProductCard key={variant.id} product={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, imageUrl: variant.media[0]?.sourceUrl ?? null, detail: variant.themes[0]?.theme.name ?? null }} inCollection={status?.inCollection ?? false} inWishlist={status?.inWishlist ?? false} returnTo={`/nouveautes?year=${year}`} />)}</div></div>)}</section>}
    {year === 2027 && <section className="latest-section upcoming-section"><div className="section-title"><div><span className="eyebrow">Radar séparé du catalogue</span><h2>Produits à venir détectés</h2><p>Ces références ne sont pas des produits du catalogue principal tant qu’une source officielle ne les confirme pas.</p></div><strong>{candidates.length} candidats</strong></div><div className="candidate-grid">{candidates.map((candidate) => <article className={`candidate-card status-${candidate.status.toLowerCase()}`} key={candidate.id}><span className="candidate-status">{candidateLabels[candidate.status]}</span><p className="reference">{candidate.displayReference}</p><h3>{candidate.name ?? "Nom non documenté"}</h3><p>{candidate.announcedMonth ? `${candidate.announcedMonth} 2027` : "2027 — mois inconnu"}</p><small>{candidate.sources} source{candidate.sources > 1 ? "s" : ""}{candidate.conflictReason ? ` · ${candidate.conflictReason}` : ""}</small></article>)}</div></section>}
    {!waves.length && !recent.length && year !== 2027 && <section className="empty-state"><h2>Aucune sortie documentée pour {year}</h2><p>Le catalogue général reste disponible.</p></section>}
  </div>;
}
