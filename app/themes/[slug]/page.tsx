import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoveryProductCard } from "../../../components/DiscoveryProductCard";
import { getThemeCollectorView } from "../../../lib/collector-insights";
import { getFrenchThemeName } from "../../../lib/theme-names";

export const dynamic = "force-dynamic";

export default async function ThemeProgressPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string }> }) {
  const slug = (await params).slug;
  const status = (await searchParams).status ?? "all";
  const result = await getThemeCollectorView(slug, status);
  if (!result) notFound();
  const name = getFrenchThemeName(result.theme);
  const percentage = result.total ? Math.round(result.owned / result.total * 100) : 0;
  const href = (value: string) => value === "all" ? `/themes/${slug}` : `/themes/${slug}?status=${value}`;
  return <div className="page-shell listing-page range-detail-page"><Link href="/themes" className="back-link">← Tous les thèmes</Link><section className="collector-page-heading range-heading"><div><span className="eyebrow">Progression par thème</span><h1>{name}</h1><p>Comptage par produit logique : les variantes techniques d’une même référence ne gonflent pas le total.</p></div><strong>{result.owned} / {result.total}<small>{percentage} % complété</small></strong></section><div className="progress-track range-progress"><span style={{ width: `${percentage}%` }} /></div><nav className="filter-chips" aria-label={`Filtrer ${name}`}><Link className={status === "all" ? "active" : ""} href={href("all")}>Tout ({result.total})</Link><Link className={status === "owned" ? "active" : ""} href={href("owned")}>✓ Possédés ({result.owned})</Link><Link className={status === "wanted" ? "active" : ""} href={href("wanted")}>♡ Recherchés ({result.wanted})</Link><Link className={status === "missing" ? "active" : ""} href={href("missing")}>○ Manquants ({result.missing})</Link></nav><section className="catalogue-grid discovery-products">{result.items.map((item) => <DiscoveryProductCard key={item.productId} product={{ id: item.variant.id, name: item.variantCount > 1 ? (item.variant.product.name ?? item.variant.displayName) : item.variant.displayName, reference: item.variant.references[0]?.displayValue ?? item.variant.product.baseReference ?? item.variant.canonicalKey, year: item.variant.releaseYear ?? item.variant.product.releaseYear, imageUrl: item.variant.media[0]?.sourceUrl ?? null, detail: item.variantCount > 1 ? `${item.variantCount} variantes` : null }} inCollection={item.inCollection} inWishlist={item.inWishlist} returnTo={href(status)} />)}</section>{result.truncated && <p className="truncation-note">Affichage limité aux 48 premières références de cette vue. <Link href={`/catalogue?theme=${encodeURIComponent(slug)}`}>Ouvrir tout le thème dans le catalogue →</Link></p>}</div>;
}
