import Link from "next/link";
import { ProductImage } from "../../components/ProductImage";
import { getFreshDeals } from "../../lib/discovery";
import { productHref, type SearchParamRecord } from "../../lib/navigation-context";
import { safeExternalOfferUrl } from "../../lib/pricing";

type Props = { searchParams: Promise<SearchParamRecord> };
export const dynamic = "force-dynamic";

const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function DealsPage({ searchParams }: Props) {
  const params = await searchParams;
  const minimumDiscount = Math.max(0, Number.parseInt(single(params.reduction) || "10", 10) || 0);
  const maximumPrice = Math.max(0, Number.parseFloat(single(params.prixMax)) || 0);
  const theme = single(params.theme).trim().toLowerCase();
  const year = Math.max(0, Number.parseInt(single(params.year), 10) || 0);
  const wishlistOnly = single(params.wishlist) === "1";
  const missingOnly = single(params.manquant) === "1";
  const allDeals = await getFreshDeals();
  const deals = allDeals.filter(({ variant, pricing, status }) => {
    const observation = pricing.bestNew?.observations[0];
    const total = observation ? Number(observation.totalPrice ?? observation.itemPrice) : Number.POSITIVE_INFINITY;
    const releaseYear = variant.releaseYear ?? variant.product.releaseYear;
    return (pricing.bestNew?.promotion ?? 0) * 100 >= minimumDiscount
      && (!maximumPrice || total <= maximumPrice)
      && (!theme || variant.themes.some(({ theme: item }) => item.slug === theme || item.name.toLowerCase() === theme))
      && (!year || releaseYear === year)
      && (!wishlistOnly || status?.inWishlist)
      && (!missingOnly || (!status?.inCollection && !status?.inWishlist));
  });
  const themes = [...new Map(allDeals.flatMap(({ variant }) => variant.themes).map(({ theme: item }) => [item.slug, item])).values()].sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const returnTo = "/bons-plans" + (new URLSearchParams(Object.entries(params).flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => [key, item]) : value ? [[key, value]] : [])).toString() ? `?${new URLSearchParams(Object.entries(params).flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => [key, item]) : value ? [[key, value]] : [])).toString()}` : "");

  return <div className="page-shell deals-page">
    <section className="page-heading"><span className="eyebrow">Prix suivis en France</span><h1>Bons plans</h1><p>Uniquement des offres neuves récentes, comparées à un prix officiel du même marché et dans la même devise.</p></section>
    <form className="filter-form deals-filters" method="get">
      <label>Réduction minimum<select name="reduction" defaultValue={String(minimumDiscount)}><option value="0">Toutes</option><option value="10">10 %</option><option value="20">20 %</option><option value="30">30 %</option></select></label>
      <label>Prix total maximum<input name="prixMax" type="number" min="0" step="1" defaultValue={maximumPrice || ""} placeholder="Ex. 50" /></label>
      <label>Thème<select name="theme" defaultValue={theme}><option value="">Tous</option>{themes.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label>Année<input name="year" type="number" min="1974" max="2100" defaultValue={year || ""} placeholder="Ex. 2026" /></label>
      <label className="checkbox-control"><input name="wishlist" type="checkbox" value="1" defaultChecked={wishlistOnly} /> Mes recherches seulement</label>
      <label className="checkbox-control"><input name="manquant" type="checkbox" value="1" defaultChecked={missingOnly} /> Non possédés seulement</label>
      <button type="submit">Filtrer</button>
    </form>
    {deals.length ? <section className="deals-grid" aria-label="Offres neuves en promotion">{deals.map(({ variant, pricing, status }) => {
      const offer = pricing.bestNew!;
      const observation = offer.observations[0]!;
      const officialPrice = pricing.listPrices.find((price) => !price.validUntil && price.marketId === offer.retailer.marketId && price.currency === observation.currency)!;
      const url = safeExternalOfferUrl(offer.url);
      const reference = variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey;
      const savings = Number(officialPrice.amount) - Number(observation.itemPrice);
      return <article className="deal-card" key={variant.id}>
        <Link className="deal-image" href={productHref(variant.id, returnTo)}><ProductImage src={variant.media[0]?.sourceUrl ?? null} alt={variant.displayName} /></Link>
        <div className="deal-body"><p className="reference">{reference}</p><h2><Link href={productHref(variant.id, returnTo)}>{variant.displayName}</Link></h2><div className="detail-status-row">{status?.inCollection && <span className="detail-status owned">✓ Possédé</span>}{!status?.inCollection && status?.inWishlist && <span className="detail-status wanted">♡ Recherché</span>}</div><p>Prix officiel {officialPrice.market.name} : <strong>{Number(officialPrice.amount).toLocaleString("fr-FR", { style: "currency", currency: officialPrice.currency })}</strong></p><p>{offer.retailer.name} · article <strong>{Number(observation.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: observation.currency })}</strong></p><strong className="deal-total">Total livré : {Number(observation.totalPrice ?? observation.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: observation.currency })}</strong><p>Livraison {observation.shippingPrice === null ? "non renseignée" : Number(observation.shippingPrice).toLocaleString("fr-FR", { style: "currency", currency: observation.currency })} · économie article {savings.toLocaleString("fr-FR", { style: "currency", currency: observation.currency })}</p><span className="promotion-badge">−{Math.round((offer.promotion ?? 0) * 100)} % sur le prix article</span><small>Remise calculée hors livraison · classement selon le coût total livré · vérifié le {observation.observedAt.toLocaleString("fr-FR")}</small>{url && <a className="button" href={url} target="_blank" rel="noreferrer sponsored">Voir l’offre ↗</a>}</div>
      </article>;
    })}</section> : <section className="empty-state collector-empty"><span aria-hidden="true">€</span><h2>Aucun bon plan suivi pour le moment</h2><p>Les offres apparaîtront ici uniquement après activation d’une source autorisée et validation d’un rapprochement fiable.</p><Link className="button" href="/recherches">Voir mes recherches</Link></section>}
  </div>;
}
