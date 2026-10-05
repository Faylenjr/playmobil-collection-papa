import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "../../../components/ProductCard";
import { getMarket } from "../../../lib/discovery";

export const dynamic = "force-dynamic";
const flags: Record<string, string> = { GERMANY: "🇩🇪", FRANCE: "🇫🇷", ITALY: "🇮🇹", NETHERLANDS: "🇳🇱", BELGIUM: "🇧🇪", "USA-PLAYMOBIL": "🇺🇸", "SPAIN-PLAYMOBIL": "🇪🇸", "UK-PLAYMOBIL": "🇬🇧" };
const names: Record<string, string> = { GERMANY: "Allemagne", FRANCE: "France", ITALY: "Italie", NETHERLANDS: "Pays-Bas", BELGIUM: "Belgique", "USA-PLAYMOBIL": "États-Unis", "SPAIN-PLAYMOBIL": "Espagne", "UK-PLAYMOBIL": "Royaume-Uni" };

export default async function CountryPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ filter?: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const filter = (await searchParams).filter ?? "all";
  const market = await getMarket(code);
  if (!market) notFound();
  const returnTo = `/pays/${encodeURIComponent(code)}${filter === "all" ? "" : `?filter=${filter}`}`;
  const byKind = market.evidenceByKey;
  const variants = market.variants.filter((variant) => {
    const status = market.statuses.get(variant.id)!;
    if (filter === "exclusive") return byKind.has(`${variant.id}:ATTESTED_EXCLUSIVE`);
    if (filter === "edition") return byKind.has(`${variant.id}:MARKET_EDITION`);
    if (filter === "presence") return byKind.has(`${variant.id}:PRESENCE`);
    if (filter === "wanted") return status.inWishlist;
    if (filter === "owned") return status.inCollection;
    return true;
  });
  const exclusiveCount = market.evidence.filter((item) => item.kind === "ATTESTED_EXCLUSIVE").length;
  const editionCount = market.evidence.filter((item) => item.kind === "MARKET_EDITION").length;
  const presenceCount = market.evidence.filter((item) => item.kind === "PRESENCE").length;
  const travelTargets = market.variants.filter((variant) => market.statuses.get(variant.id)?.inWishlist && (byKind.has(`${variant.id}:ATTESTED_EXCLUSIVE`) || byKind.has(`${variant.id}:MARKET_EDITION`)));
  return <div className="page-shell listing-page">
    <section className="page-heading country-heading"><span className="country-flag">{flags[code] ?? "🌍"}</span><div><span className="eyebrow">Marché documenté</span><h1>{names[code] ?? market.name}</h1><p>{exclusiveCount} exclusivités explicitement signalées · {editionCount} éditions locales · {presenceCount} présences documentées.</p></div></section>
    {travelTargets.length > 0 && <section className="travel-callout"><strong>À chercher en {names[code] ?? market.name}</strong><span>{travelTargets.length} exclusivités ou éditions locales sont dans « Mes recherches ».</span><ul>{travelTargets.slice(0, 12).map((variant) => <li key={variant.id}><Link href={`/sets/${variant.id}?returnTo=${encodeURIComponent(`/pays/${code}`)}`}>♡ {variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey} — {variant.displayName}</Link></li>)}</ul></section>}
    <nav className="filter-chips" aria-label="Filtrer les objets du marché">
      {[{ key: "all", label: "Toutes" }, { key: "exclusive", label: "Exclusivités attestées" }, { key: "edition", label: "Éditions locales" }, { key: "presence", label: "Présence marché" }, { key: "wanted", label: "Je recherche" }, { key: "owned", label: "Je possède" }].map((item) => <Link className={filter === item.key ? "active" : ""} href={`/pays/${encodeURIComponent(code)}${item.key === "all" ? "" : `?filter=${item.key}`}`} key={item.key}>{item.label}</Link>)}
    </nav>
    {filter === "wanted" && <div className="travel-callout"><strong>À rechercher pendant le voyage</strong><span>{variants.length} objets de ce marché sont dans la wishlist.</span></div>}
    <div className="catalogue-grid discovery-products">
      {variants.map((variant) => {
        const status = market.statuses.get(variant.id)!;
        const exclusive = byKind.get(`${variant.id}:ATTESTED_EXCLUSIVE`);
        const edition = byKind.get(`${variant.id}:MARKET_EDITION`);
        return <ProductCard key={variant.id} data={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, market: exclusive ? "Exclusivité signalée" : edition ? "Édition locale" : "Présence documentée", variantLabel: variant.variantLabel, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection={status.inCollection} inWishlist={status.inWishlist} quantity={status.quantity} returnTo={returnTo} />;
      })}
    </div>
    {!variants.length && <section className="empty-state"><h2>Aucun objet dans ce filtre</h2><p>Aucune exclusivité n’est inventée lorsque la source ne l’atteste pas.</p></section>}
  </div>;
}
