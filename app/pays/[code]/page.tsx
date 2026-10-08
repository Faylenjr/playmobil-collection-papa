import Link from "next/link";
import { notFound } from "next/navigation";
import { CountryFlag, marketDisplayName } from "../../../components/CountryFlag";
import { ProductCard } from "../../../components/ProductCard";
import { commercialContextLabels, type CommercialContextKind } from "../../../lib/commercial-context";
import { getMarket } from "../../../lib/discovery";

export const dynamic = "force-dynamic";
export default async function CountryPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ filter?: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase();
  const filter = (await searchParams).filter ?? "all";
  const market = await getMarket(code);
  if (!market) notFound();
  const countryName = marketDisplayName(code, market.name);
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
  const countDistinctVariants = (kind: "ATTESTED_EXCLUSIVE" | "MARKET_EDITION" | "PRESENCE") => new Set(market.evidence.filter((item) => item.kind === kind).map((item) => item.variantId)).size;
  const exclusiveCount = countDistinctVariants("ATTESTED_EXCLUSIVE");
  const editionCount = countDistinctVariants("MARKET_EDITION");
  const presenceCount = countDistinctVariants("PRESENCE");
  const documentedVariants = new Set(market.evidence.map((item) => item.variantId)).size;
  const travelTargets = market.variants.filter((variant) => market.statuses.get(variant.id)?.inWishlist && (byKind.has(`${variant.id}:ATTESTED_EXCLUSIVE`) || byKind.has(`${variant.id}:MARKET_EDITION`) || market.commercialByVariant.has(variant.id)));
  const contextKinds = Object.keys(commercialContextLabels) as CommercialContextKind[];
  return <div className="page-shell listing-page">
    <section className="page-heading country-heading"><CountryFlag code={code} label={countryName} large /><div><span className="eyebrow">Marché documenté</span><h1>{countryName}</h1><p><strong>{documentedVariants}</strong> variantes documentées</p><p>{exclusiveCount} exclusivités géographiques attestées · {editionCount} éditions spécifiques au marché · {presenceCount} présences documentées.</p></div></section>
    {travelTargets.length > 0 && <section className="travel-callout"><strong>À chercher en {countryName}</strong><span>{travelTargets.length} objets documentés pour ce marché sont dans « Mes recherches ».</span><ul>{travelTargets.slice(0, 12).map((variant) => {
      const contexts = market.commercialByVariant.get(variant.id) ?? [];
      const nature = byKind.has(`${variant.id}:ATTESTED_EXCLUSIVE`) ? `Exclusivité géographique attestée` : byKind.has(`${variant.id}:MARKET_EDITION`) ? `Édition ${countryName.toLowerCase()}` : "Présence documentée";
      return <li key={variant.id}><Link href={`/sets/${variant.id}?returnTo=${encodeURIComponent(`/pays/${code}`)}`}>♡ {variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey} — {variant.displayName}</Link><small>{nature}{contexts[0] ? ` · Partenaire/contexte : ${contexts[0].context.canonicalName}` : ""} · Recherché</small></li>;
    })}</ul></section>}
    {market.contextGroups.length > 0 && <section className="commercial-context-section"><div className="section-title"><span className="eyebrow">Contexte commercial</span><h2>Éditions, partenaires et opérations documentés</h2><p>Ces mentions décrivent un canal commercial ou éditorial. Elles ne prouvent jamais, à elles seules, une exclusivité géographique.</p></div><div className="commercial-context-grid">{contextKinds.map((kind) => {
      const groups = market.contextGroups.filter((group) => group.kind === kind);
      if (!groups.length) return null;
      const total = new Set(market.commercialEvidence.filter((item) => item.context.kind === kind).map((item) => item.variantId)).size;
      return <article className="commercial-context-card" key={kind}><h3>{commercialContextLabels[kind]}</h3><strong>{total} variantes distinctes</strong><ul>{groups.slice(0, 12).map((group) => <li key={`${kind}:${group.name}`}><span>{group.name}</span><b>{group.variants}</b></li>)}</ul>{groups.length > 12 && <small>+ {groups.length - 12} autres contextes documentés</small>}</article>;
    })}</div></section>}
    <nav className="filter-chips" aria-label="Filtrer les objets du marché">
      {[{ key: "all", label: "Toutes" }, { key: "exclusive", label: "Exclusivités attestées" }, { key: "edition", label: "Éditions locales" }, { key: "presence", label: "Présence marché" }, { key: "wanted", label: "Je recherche" }, { key: "owned", label: "Je possède" }].map((item) => <Link className={filter === item.key ? "active" : ""} href={`/pays/${encodeURIComponent(code)}${item.key === "all" ? "" : `?filter=${item.key}`}`} key={item.key}>{item.label}</Link>)}
    </nav>
    {filter === "wanted" && <div className="travel-callout"><strong>À rechercher pendant le voyage</strong><span>{variants.length} objets de ce marché sont dans la wishlist.</span></div>}
    <div className="catalogue-grid discovery-products">
      {variants.map((variant) => {
        const status = market.statuses.get(variant.id)!;
        const exclusive = byKind.get(`${variant.id}:ATTESTED_EXCLUSIVE`);
        const edition = byKind.get(`${variant.id}:MARKET_EDITION`);
        const context = market.commercialByVariant.get(variant.id)?.[0];
        return <ProductCard key={variant.id} data={{ id: variant.id, name: variant.displayName, reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, market: exclusive ? "Exclusivité géographique attestée" : edition ? context ? `Édition locale · ${context.context.canonicalName}` : "Édition locale" : context ? `Présence · ${context.context.canonicalName}` : "Présence documentée", variantLabel: variant.variantLabel, imageUrl: variant.media[0]?.sourceUrl ?? null }} inCollection={status.inCollection} inWishlist={status.inWishlist} quantity={status.quantity} returnTo={returnTo} />;
      })}
    </div>
    {!variants.length && <section className="empty-state"><h2>Aucun objet dans ce filtre</h2><p>Aucune exclusivité n’est inventée lorsque la source ne l’atteste pas.</p></section>}
  </div>;
}
