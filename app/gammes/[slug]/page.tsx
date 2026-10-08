import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoveryProductCard } from "../../../components/DiscoveryProductCard";
import { getProductRange } from "../../../lib/collector-insights";

export const dynamic = "force-dynamic";

export default async function RangePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const slug = (await params).slug;
  const range = await getProductRange(slug);
  if (!range) notFound();
  const status = (await searchParams).status ?? "all";
  const filtered = range.items.filter((item) => status === "owned" ? item.inCollection : status === "wanted" ? !item.inCollection && item.inWishlist : status === "missing" ? !item.inCollection && !item.inWishlist : true);
  const percentage = range.total ? Math.round(range.owned / range.total * 100) : 0;
  const href = (value: string) => value === "all" ? `/gammes/${slug}` : `/gammes/${slug}?status=${value}`;
  const returnTo = href(status);
  return <div className="page-shell listing-page range-detail-page">
    <Link href="/gammes" className="back-link">← Toutes les gammes</Link>
    <section className="collector-page-heading range-heading"><div><span className="eyebrow">{range.kind === "SERIES" ? "Série" : range.kind === "LICENSE" ? "Licence" : "Gamme"} officielle</span><h1>{range.canonicalName}</h1><p>{range.description ?? `${range.total} références commerciales documentées par ${range.source.name}.`}</p></div><strong>{range.owned} / {range.total}<small>{percentage} % complété</small></strong></section>
    <div className="progress-track range-progress" aria-label={`${percentage} % complété`}><span style={{ width: `${percentage}%` }} /></div>
    <nav className="filter-chips" aria-label="Filtrer la gamme"><Link className={status === "all" ? "active" : ""} href={href("all")}>Tout ({range.total})</Link><Link className={status === "owned" ? "active" : ""} href={href("owned")}>✓ Possédés ({range.owned})</Link><Link className={status === "wanted" ? "active" : ""} href={href("wanted")}>♡ Recherchés ({range.wanted})</Link><Link className={status === "missing" ? "active" : ""} href={href("missing")}>○ Manquants ({range.missing})</Link></nav>
    {range.waves.length > 0 && <p className="range-waves"><strong>Vagues associées :</strong> {range.waves.map((wave, index) => <span key={wave.slug}>{index > 0 ? " · " : ""}<Link href={`/nouveautes?year=${wave.releaseYear}#${wave.slug}`}>{wave.name}</Link></span>)}</p>}
    {filtered.length ? <section className="catalogue-grid discovery-products" aria-label={`Produits ${range.canonicalName}`}>{filtered.map((item) => <DiscoveryProductCard key={item.productId} product={{ id: item.variant.id, name: item.variantCount > 1 ? (item.variant.product.name ?? item.variant.displayName) : item.variant.displayName, reference: item.observedReference, year: item.variant.releaseYear ?? item.variant.product.releaseYear, imageUrl: item.variant.media[0]?.sourceUrl ?? null, detail: item.variantCount > 1 ? `${item.variantCount} variantes internes` : null }} inCollection={item.inCollection} inWishlist={item.inWishlist} returnTo={returnTo} />)}</section> : <section className="empty-state"><h2>Aucune référence dans cette vue</h2><p>Essayez un autre statut de collection.</p></section>}
    <p className="source-note"><a href={range.sourceUrl} target="_blank" rel="noreferrer">Voir la source officielle ↗</a> · observée le {range.observedAt.toLocaleDateString("fr-FR")}</p>
  </div>;
}
