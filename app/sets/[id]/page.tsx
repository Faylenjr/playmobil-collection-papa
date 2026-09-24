import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "../../../components/ProductImage";
import { CollectionControls } from "../../../components/CollectionControls";
import { getVariant } from "../../../lib/catalogue";
import { getVariantCollectorState } from "../../../lib/collector";
import { updateCollectionItem } from "../../actions/collector";

type ProductPageProps = { params: Promise<{ id: string }> };

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

export default async function ProductPage({ params }: ProductPageProps) {
  const id = (await params).id;
  const [variant, collectorState] = await Promise.all([getVariant(id), getVariantCollectorState(id)]);
  if (!variant) notFound();

  const name = variant.displayName;
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

  return (
    <div className="page-shell detail-page">
      <Link href="/catalogue" className="back-link">← Retour au catalogue</Link>

      <section className="product-hero">
        <div className="hero-image">
          <ProductImage src={primaryImage?.sourceUrl ?? null} alt={name} priority />
        </div>
        <div className="hero-copy">
          <span className="eyebrow">{variant.variantKind.replaceAll("_", " ")}</span>
          <p className="hero-reference">{reference ?? "Référence non renseignée"}</p>
          <h1>{name}</h1>
          {(variant.description ?? variant.product.description) && <p className="description">{variant.description ?? variant.product.description}</p>}
          <dl className="detail-grid">
            <Field label="Année" value={year} />
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
