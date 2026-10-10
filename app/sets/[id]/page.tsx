import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "../../../components/ProductImage";
import { CollectionControls } from "../../../components/CollectionControls";
import { getVariant } from "../../../lib/catalogue";
import { getVariantCollectorState } from "../../../lib/collector";
import { QuickCollectionEditor } from "../../../components/QuickCollectionEditor";
import { DeleteCollectionCopyButton } from "../../../components/DeleteCollectionCopyButton";
import { copyLabel } from "../../../lib/collection-management";
import { returnLabel, sanitizeReturnTo } from "../../../lib/navigation-context";
import { getVariantPriceSummary } from "../../../lib/discovery";
import { calculatePromotion, deliveryEstimateLabel, isOfferFresh, marketplaceSearchLinks, priceHistoryStats, relativeRefreshLabel, safeExternalOfferUrl } from "../../../lib/pricing";
import { getFrenchThemeName } from "../../../lib/theme-names";

type ProductPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> };

const conditionLabels = {
  SEALED: "Sous blister",
  NEW: "Neuf",
  EXCELLENT: "Excellent",
  GOOD: "Bon",
  FAIR: "Correct",
  POOR: "Usé",
  UNKNOWN: "Non renseigné",
} as const;

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return <div className="detail-field"><dt>{label}</dt><dd>{value}</dd></div>;
}

function LinkedField({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  if (!links.length) return null;
  return <div className="detail-field"><dt>{label}</dt><dd className="metadata-links">{links.map((link, index) => <span key={`${link.href}-${link.label}`}>{index > 0 ? ", " : ""}<Link href={link.href}>{link.label}</Link></span>)}</dd></div>;
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const id = (await params).id;
  const returnTo = sanitizeReturnTo((await searchParams).returnTo);
  const [variant, collectorState, prices] = await Promise.all([getVariant(id), getVariantCollectorState(id), getVariantPriceSummary(id)]);
  if (!variant) notFound();

  const name = variant.displayName;
  const originalName = variant.name?.trim() || variant.product.name?.trim();
  const reference = variant.references[0]?.displayValue ?? variant.product.baseReference;
  const year = variant.releaseYear ?? variant.product.releaseYear;
  const primaryImage = variant.media[0];
  const otherImages = variant.media.slice(1);
  const themes = variant.themes.length ? variant.themes : variant.product.themes;
  const translations = [
    ...new Map(
      [...variant.translations, ...variant.product.translations].map((translation) => [
        translation.locale.toLowerCase(),
        translation,
      ]),
    ).values(),
  ];
  const klickypediaRecords = variant.sourceRecords.filter(({ source }) =>
    source.key.toLowerCase().includes("klickypedia") || source.baseUrl.toLowerCase().includes("klickypedia"),
  );
  const identifiers = [...variant.productIdentifiers, ...variant.product.identifiers];
  const currentOffers = prices.offers.filter((offer) => offer.availability === "AVAILABLE" && isOfferFresh(offer.lastObservedAt));
  const deliveredTotal = (offer: typeof currentOffers[number]) => Number(offer.observations[0]?.totalPrice ?? offer.observations[0]?.itemPrice ?? Number.POSITIVE_INFINITY);
  const newOffers = currentOffers.filter((offer) => offer.condition === "NEW" || offer.condition === "SEALED").sort((left, right) => deliveredTotal(left) - deliveredTotal(right));
  const usedOffers = currentOffers.filter((offer) => offer.condition === "USED").sort((left, right) => deliveredTotal(left) - deliveredTotal(right));
  const koupobolUrl = prices.koupobolUrl ? safeExternalOfferUrl(prices.koupobolUrl) : null;
  const deliveryLabel = deliveryEstimateLabel(process.env.EBAY_DELIVERY_COUNTRY ?? "FR", process.env.EBAY_DELIVERY_POSTAL_CODE);

  return (
    <div className="page-shell detail-page">
      <Link href={returnTo} className="back-link">← {returnLabel(returnTo)}</Link>

      <section className="product-hero">
        <div className="hero-image">
          <ProductImage src={primaryImage?.sourceUrl ?? null} alt={name} priority />
        </div>
        <div className="hero-copy">
          <span className="eyebrow">{variant.variantKind.replaceAll("_", " ")}</span>
          <div className="detail-status-row">
            {collectorState.item && <span className="detail-status owned">✓ Dans ma collection</span>}
            {!collectorState.item && collectorState.wanted && <span className="detail-status wanted">♡ Je recherche</span>}
          </div>
          <p className="hero-reference">{reference ?? "Référence non renseignée"}</p>
          <h1>{name}</h1>
          {(variant.description ?? variant.product.description) && <p className="description">{variant.description ?? variant.product.description}</p>}
          <dl className="detail-grid">
            <LinkedField label="Année" links={year ? [{ href: `/catalogue?year=${year}`, label: String(year) }] : []} />
            <Field label="Titre original" value={originalName && originalName !== name ? originalName : null} />
            <LinkedField label="Marchés" links={variant.markets.map(({ market }) => ({ href: `/pays/${encodeURIComponent(market.code)}`, label: market.name }))} />
            <Field label="Format" value={variant.format} />
            <Field label="Variante" value={variant.variantLabel} />
            <Field label="Pièces" value={variant.pieceCount} />
            <Field label="Figurines" value={variant.figureCount} />
            <Field label="Âge" value={variant.ageMin || variant.ageMax ? `${variant.ageMin ?? "?"}–${variant.ageMax ?? "?"} ans` : null} />
            <LinkedField label="Thèmes" links={themes.map(({ theme }) => ({ href: `/themes/${encodeURIComponent(theme.slug)}`, label: getFrenchThemeName(theme) }))} />
            <LinkedField label="Gammes" links={variant.product.rangeMemberships.map(({ range }) => ({ href: `/gammes/${range.slug}`, label: range.canonicalName }))} />
            <LinkedField label="Vagues" links={variant.product.releaseWaveItems.map(({ releaseWave }) => ({ href: `/nouveautes?year=${releaseWave.releaseYear}#${releaseWave.slug}`, label: releaseWave.name }))} />
          </dl>
        </div>
      </section>

      <section className="collector-panel" id="mes-exemplaires">
        <div className="section-heading"><span className="eyebrow">Mon inventaire</span><h2>Ma collection</h2></div>
        <CollectionControls variantId={variant.id} inCollection={Boolean(collectorState.item)} inWishlist={Boolean(collectorState.wanted)} />
        {collectorState.item && <div className="owned-details"><p><strong>{collectorState.item.copies.length}</strong> exemplaire{collectorState.item.copies.length > 1 ? "s" : ""} physique{collectorState.item.copies.length > 1 ? "s" : ""}</p>
          <div className="copy-detail-list">{collectorState.item.copies.map((copy, index) => <article className="copy-card" key={copy.id}><h3>{copyLabel(index, collectorState.item!.copies.length)}</h3><dl className="detail-grid"><Field label="État" value={conditionLabels[copy.condition]} /><Field label="Complet" value={copy.isComplete === null ? "Non renseigné" : copy.isComplete ? "Oui" : "Non"} /><Field label="Boîte" value={copy.hasBox === null ? "Non renseigné" : copy.hasBox ? "Oui" : "Non"} /><Field label="Notice" value={copy.hasInstructions === null ? "Non renseigné" : copy.hasInstructions ? "Oui" : "Non"} /><Field label="Notes" value={copy.notes} /></dl><QuickCollectionEditor variantId={variant.id} copyId={copy.id} item={{ ...copy, purchasePrice: copy.purchasePrice === null ? null : String(copy.purchasePrice) }} /><DeleteCollectionCopyButton copyId={copy.id} isLast={collectorState.item!.copies.length === 1} /></article>)}</div>
          <QuickCollectionEditor variantId={variant.id} addMode />
        </div>}
      </section>

      <section className="price-panel">
        <div className="section-heading"><span className="eyebrow">Prix et disponibilités</span><h2>Où trouver ce Playmobil ?</h2></div>
        {prices.listPrices.length > 0 ? <div className="list-price-grid">{prices.listPrices.map((price) => <div className="detail-field" key={price.id}><dt>{price.validUntil ? "Dernier prix officiel connu" : "Prix officiel actuel"} · {price.market.name}</dt><dd>{Number(price.amount).toLocaleString("fr-FR", { style: "currency", currency: price.currency })}</dd><small>{price.source.name} · observé le {price.observedAt.toLocaleDateString("fr-FR")}{price.validUntil ? " · produit archivé" : ""}</small></div>)}</div> : <p className="muted-copy">Prix officiel non documenté pour le moment.</p>}
        <p className="muted-copy">{deliveryLabel}. Le classement privilégie le total livré lorsqu’il est connu.</p>
        <OfferGroup title="Offres neuves" empty="Aucune offre neuve suivie pour le moment." offers={newOffers} listPrices={prices.listPrices} />
        <OfferGroup title="Occasion" empty="Aucune offre d’occasion suivie pour le moment." offers={usedOffers} listPrices={prices.listPrices} />
        {reference && <div className="manual-market-links">{koupobolUrl && <a href={koupobolUrl} target="_blank" rel="noreferrer sponsored">Comparer sur Koupobol ↗</a>}<a href={marketplaceSearchLinks(reference).ebay} target="_blank" rel="noreferrer">Voir sur eBay ↗</a><a href={marketplaceSearchLinks(reference).leboncoin} target="_blank" rel="noreferrer">Voir sur Leboncoin ↗</a><a href={marketplaceSearchLinks(reference).dealabs} target="_blank" rel="noreferrer">Rechercher sur Dealabs ↗</a></div>}
      </section>

      {otherImages.length > 0 && (
        <section className="detail-section">
          <div className="section-heading"><span className="eyebrow">Galerie</span><h2>Autres images</h2></div>
          <div className="media-grid">
            {otherImages.map((media) => <ProductImage key={media.id} src={media.sourceUrl} alt={`${name} — ${media.kind}`} />)}
          </div>
        </section>
      )}

      <section className="detail-columns">
        {translations.length > 0 && (
          <div className="detail-section compact">
            <h2>Traductions</h2>
            <ul className="clean-list">
              {translations.map((translation) => (
                <li key={`${translation.locale}-${translation.id}`}><strong>{translation.locale}</strong><span>{translation.name ?? "Nom non renseigné"}</span></li>
              ))}
            </ul>
          </div>
        )}
        {variant.instructions.length > 0 && (
          <div className="detail-section compact">
            <h2>Notices</h2>
            <ul className="link-list">
              {variant.instructions.map((instruction) => <li key={instruction.id}><a href={instruction.documentUrl} target="_blank" rel="noreferrer">Notice {instruction.locale ? `(${instruction.locale})` : ""} ↗</a></li>)}
            </ul>
          </div>
        )}
      </section>

      {(variant.figures.length > 0 || variant.parts.length > 0) && (
        <section className="detail-columns">
          {variant.figures.length > 0 && <div className="detail-section compact"><h2>Figurines</h2><ul className="inventory-list">{variant.figures.map(({ figure, quantity }) => <li key={figure.id}><span>{figure.name ?? figure.canonicalKey}</span><b>{quantity ? `× ${quantity}` : ""}</b></li>)}</ul></div>}
          {variant.parts.length > 0 && <div className="detail-section compact"><h2>Pièces</h2><ul className="inventory-list">{variant.parts.map(({ part, quantity }) => <li key={part.id}><span>{part.name ?? part.partNumber}</span><b>{quantity ? `× ${quantity}` : ""}</b></li>)}</ul></div>}
        </section>
      )}

      <section className="technical-panel">
        <details>
          <summary>Données techniques et sources</summary>
          <dl className="technical-grid">
            <Field label="Clé canonique" value={variant.canonicalKey} />
            <Field label="Références" value={variant.references.map((item) => item.displayValue).join(", ")} />
            <Field label="Statut" value={variant.status} />
            <Field label="Date de sortie" value={variant.releaseDate?.toLocaleDateString("fr-FR")} />
            {identifiers.map((identifier) => <Field key={identifier.id} label={identifier.type === "EAN" ? "EAN" : identifier.type.replaceAll("_", " ")} value={`${identifier.rawValue} · ${identifier.source.name}${identifier.market ? ` · ${identifier.market.name}` : ""}`} />)}
          </dl>
          {klickypediaRecords.length > 0 && <div className="source-links"><h3>Klickypedia</h3>{klickypediaRecords.map((record) => <a key={record.id} href={record.sourceUrl} target="_blank" rel="noreferrer">Voir la fiche source ↗</a>)}</div>}
        </details>
      </section>
    </div>
  );
}

function OfferGroup({ title, empty, offers, listPrices }: { title: string; empty: string; offers: Awaited<ReturnType<typeof getVariantPriceSummary>>["offers"]; listPrices: Awaited<ReturnType<typeof getVariantPriceSummary>>["listPrices"] }) {
  return <div className="offer-group"><h3>{title}</h3>{offers.length ? <div className="offer-list">{offers.map((offer) => {
    const latest = offer.observations[0];
    const safeUrl = safeExternalOfferUrl(offer.url);
    const listPrice = latest && offer.retailer.marketId ? listPrices.find((price) => !price.validUntil && price.marketId === offer.retailer.marketId && price.currency === latest.currency) : null;
    const promotion = latest && listPrice ? calculatePromotion({ condition: offer.condition, currentPrice: Number(latest.itemPrice), currentCurrency: latest.currency, currentMarket: offer.retailer.market?.code ?? null, listPrice: Number(listPrice.amount), listCurrency: listPrice.currency, listMarket: listPrice.market.code, observedAt: latest.observedAt }) : null;
    const history = priceHistoryStats(offer.observations.map((item) => ({ itemPrice: Number(item.itemPrice), totalPrice: item.totalPrice === null ? null : Number(item.totalPrice), observedAt: item.observedAt })));
    return <article key={offer.id}><div><strong>{offer.retailer.name}</strong><span>{offer.condition === "USED" ? "Occasion" : offer.condition === "SEALED" ? "Scellé" : "Neuf"} · {offer.availability === "AVAILABLE" ? "Disponible" : offer.availability}</span></div>{latest ? <div className="offer-prices"><b>{Number(latest.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })}</b><small>Livraison {latest.shippingPrice === null ? "non renseignée" : Number(latest.shippingPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })} · Total {Number(latest.totalPrice ?? latest.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })}</small><small>{relativeRefreshLabel(latest.observedAt)} · {latest.observedAt.toLocaleString("fr-FR")}</small>{promotion !== null && promotion > 0 && <span className="promotion-badge">−{Math.round(promotion * 100)} % sur le prix article</span>}{history?.drop && <small>Baisse récente : −{history.drop.amount.toLocaleString("fr-FR", { style: "currency", currency: latest.currency })} ({Math.round(history.drop.percentage * 100)} %)</small>}{history && offer.observations.length > 1 && <details><summary>Historique ({offer.observations.length})</summary><p>Plus bas livré : {history.lowest.toLocaleString("fr-FR", { style: "currency", currency: latest.currency })} · plus haut : {history.highest.toLocaleString("fr-FR", { style: "currency", currency: latest.currency })}</p><ul>{offer.observations.slice(0, 10).map((item) => <li key={item.id}>{item.observedAt.toLocaleDateString("fr-FR")} · {Number(item.totalPrice ?? item.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: item.currency })}</li>)}</ul></details>}</div> : <b>Prix indisponible</b>}{safeUrl && <a href={safeUrl} target="_blank" rel="noreferrer sponsored">Voir l’offre ↗</a>}</article>;
  })}</div> : <p className="muted-copy">{empty}</p>}</div>;
}
