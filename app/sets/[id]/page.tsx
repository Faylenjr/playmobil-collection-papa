import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "../../../components/ProductImage";
import { CollectionControls } from "../../../components/CollectionControls";
import { getVariant } from "../../../lib/catalogue";
import { getVariantCollectorState } from "../../../lib/collector";
import { updateCollectionItem } from "../../actions/collector";
import { returnLabel, sanitizeReturnTo } from "../../../lib/navigation-context";
import { getVariantPriceSummary } from "../../../lib/discovery";
import { calculatePromotion, isOfferFresh, marketplaceSearchLinks, safeExternalOfferUrl } from "../../../lib/pricing";

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
  const currentOffers = prices.offers.filter((offer) => offer.availability === "AVAILABLE" && isOfferFresh(offer.lastObservedAt));
  const newOffers = currentOffers.filter((offer) => offer.condition === "NEW" || offer.condition === "SEALED");
  const usedOffers = currentOffers.filter((offer) => offer.condition === "USED");
  const koupobolUrl = prices.koupobolUrl ? safeExternalOfferUrl(prices.koupobolUrl) : null;

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
            <Field label="Année" value={year} />
            <Field label="Titre original" value={originalName && originalName !== name ? originalName : null} />
            <Field label="Marché" value={variant.markets.map(({ market }) => market.name).join(", ")} />
            <Field label="Format" value={variant.format} />
            <Field label="Variante" value={variant.variantLabel} />
            <Field label="Pièces" value={variant.pieceCount} />
            <Field label="Figurines" value={variant.figureCount} />
            <Field label="Âge" value={variant.ageMin || variant.ageMax ? `${variant.ageMin ?? "?"}–${variant.ageMax ?? "?"} ans` : null} />
            <Field label="Thème" value={themes.map(({ theme }) => theme.name).join(", ")} />
          </dl>
        </div>
      </section>

      <section className="collector-panel">
        <div className="section-heading"><span className="eyebrow">Mon inventaire</span><h2>Ma collection</h2></div>
        <CollectionControls variantId={variant.id} inCollection={Boolean(collectorState.item)} inWishlist={Boolean(collectorState.wanted)} />
        {collectorState.item && <div className="owned-details">
          <dl className="detail-grid">
            <Field label="Quantité" value={collectorState.item.quantity} />
            <Field label="État" value={conditionLabels[collectorState.item.condition]} />
            <Field label="Complet" value={collectorState.item.isComplete === null ? "Non renseigné" : collectorState.item.isComplete ? "Oui" : "Non"} />
            <Field label="Boîte" value={collectorState.item.hasBox === null ? "Non renseigné" : collectorState.item.hasBox ? "Oui" : "Non"} />
            <Field label="Notice" value={collectorState.item.hasInstructions === null ? "Non renseigné" : collectorState.item.hasInstructions ? "Oui" : "Non"} />
            <Field label="Notes" value={collectorState.item.notes} />
          </dl>
          <details className="edit-collection"><summary>Modifier les informations</summary><CollectionEditor variantId={variant.id} item={collectorState.item} /></details>
        </div>}
      </section>

      <section className="price-panel">
        <div className="section-heading"><span className="eyebrow">Prix et disponibilités</span><h2>Où trouver ce Playmobil ?</h2></div>
        {prices.listPrices.length > 0 ? <div className="list-price-grid">{prices.listPrices.map((price) => <div className="detail-field" key={price.id}><dt>Prix conseillé · {price.market.name}</dt><dd>{Number(price.amount).toLocaleString("fr-FR", { style: "currency", currency: price.currency })}</dd><small>{price.source.name} · observé le {price.observedAt.toLocaleDateString("fr-FR")}</small></div>)}</div> : <p className="muted-copy">Prix conseillé non documenté pour le moment.</p>}
        <OfferGroup title="Offres neuves" empty="Aucune offre neuve suivie pour le moment." offers={newOffers} listPrices={prices.listPrices} />
        <OfferGroup title="Occasion" empty="Aucune offre d’occasion suivie pour le moment." offers={usedOffers} listPrices={prices.listPrices} />
        {reference && <div className="manual-market-links">{koupobolUrl && <a href={koupobolUrl} target="_blank" rel="noreferrer sponsored">Voir les prix sur Koupobol ↗</a>}<a href={marketplaceSearchLinks(reference).ebay} target="_blank" rel="noreferrer">Voir sur eBay ↗</a><a href={marketplaceSearchLinks(reference).leboncoin} target="_blank" rel="noreferrer">Voir sur Leboncoin ↗</a><a href={marketplaceSearchLinks(reference).dealabs} target="_blank" rel="noreferrer">Rechercher sur Dealabs ↗</a></div>}
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
    const listPrice = latest && offer.retailer.marketId ? listPrices.find((price) => price.marketId === offer.retailer.marketId && price.currency === latest.currency) : null;
    const promotion = latest && listPrice ? calculatePromotion({ condition: offer.condition, currentPrice: Number(latest.totalPrice ?? latest.itemPrice), currentCurrency: latest.currency, currentMarket: offer.retailer.market?.code ?? null, listPrice: Number(listPrice.amount), listCurrency: listPrice.currency, listMarket: listPrice.market.code, observedAt: latest.observedAt }) : null;
    return <article key={offer.id}><div><strong>{offer.retailer.name}</strong><span>{offer.condition === "USED" ? "Occasion" : offer.condition === "SEALED" ? "Scellé" : "Neuf"}</span></div>{latest ? <div className="offer-prices"><b>{Number(latest.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })}</b><small>Livraison {latest.shippingPrice === null ? "non renseignée" : Number(latest.shippingPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })} · Total {Number(latest.totalPrice ?? latest.itemPrice).toLocaleString("fr-FR", { style: "currency", currency: latest.currency })}</small><small>Vérifié le {latest.observedAt.toLocaleString("fr-FR")}</small>{promotion !== null && promotion > 0 && <span className="promotion-badge">−{Math.round(promotion * 100)} % vs prix officiel</span>}</div> : <b>Prix indisponible</b>}{safeUrl && <a href={safeUrl} target="_blank" rel="noreferrer sponsored">Voir l’offre ↗</a>}</article>;
  })}</div> : <p className="muted-copy">{empty}</p>}</div>;
}

function CollectionEditor({ variantId, item }: { variantId: string; item: NonNullable<Awaited<ReturnType<typeof getVariantCollectorState>>["item"]> }) {
  const update = updateCollectionItem.bind(null, variantId);
  const booleanOptions = <><option value="unknown">Non renseigné</option><option value="yes">Oui</option><option value="no">Non</option></>;
  return <form action={update} className="collection-editor">
    <label>Quantité<input name="quantity" type="number" min="1" max="999" defaultValue={item.quantity} /></label>
    <label>État<select name="condition" defaultValue={item.condition}><option value="UNKNOWN">Non renseigné</option><option value="SEALED">Sous blister</option><option value="NEW">Neuf</option><option value="EXCELLENT">Excellent</option><option value="GOOD">Bon</option><option value="FAIR">Correct</option><option value="POOR">Usé</option></select></label>
    <label>Complet<select name="isComplete" defaultValue={item.isComplete === null ? "unknown" : item.isComplete ? "yes" : "no"}>{booleanOptions}</select></label>
    <label>Avec boîte<select name="hasBox" defaultValue={item.hasBox === null ? "unknown" : item.hasBox ? "yes" : "no"}>{booleanOptions}</select></label>
    <label>Avec notice<select name="hasInstructions" defaultValue={item.hasInstructions === null ? "unknown" : item.hasInstructions ? "yes" : "no"}>{booleanOptions}</select></label>
    <label className="wide">Notes<textarea name="notes" defaultValue={item.notes ?? ""} rows={3} /></label>
    <button type="submit">Enregistrer les modifications</button>
  </form>;
}
