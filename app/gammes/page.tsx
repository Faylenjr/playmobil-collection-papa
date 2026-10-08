import Link from "next/link";
import { ProductImage } from "../../components/ProductImage";
import { getProductRanges } from "../../lib/collector-insights";

export const dynamic = "force-dynamic";

const rangeKinds = { LINE: "Gamme", SERIES: "Série", LICENSE: "Licence", SUBLINE: "Sous-gamme" } as const;

export default async function RangesPage() {
  const ranges = await getProductRanges();
  return <div className="page-shell listing-page ranges-page">
    <section className="page-heading themes-heading"><span className="eyebrow">Checklist collectionneur</span><h1>Gammes et séries</h1><p>Des ensembles commerciaux nommés par une source officielle. Ils restent distincts des thèmes et des vagues de sortie.</p></section>
    <section className="range-grid" aria-label="Gammes Playmobil documentées">{ranges.map((range) => {
      const percentage = range.total ? Math.round(range.owned / range.total * 100) : 0;
      return <Link className="range-card" href={`/gammes/${range.slug}`} key={range.id}><span className="range-card__image"><ProductImage src={range.imageUrl} alt={range.canonicalName} /></span><span className="range-card__body"><small>{rangeKinds[range.kind]} · {range.startYear ?? "Période inconnue"}</small><strong>{range.canonicalName}</strong><span>{range.owned} possédée{range.owned > 1 ? "s" : ""} · {range.wanted} recherchée{range.wanted > 1 ? "s" : ""} · {range.missing} manquante{range.missing > 1 ? "s" : ""}</span><span className="progress-track" aria-label={`${percentage} % complété`}><i style={{ width: `${percentage}%` }} /></span><b>{range.owned} / {range.total} · {percentage} %</b></span></Link>;
    })}</section>
  </div>;
}
