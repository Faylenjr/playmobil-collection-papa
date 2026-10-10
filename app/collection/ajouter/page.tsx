import Link from "next/link";
import { QuickCollectionEditor } from "../../../components/QuickCollectionEditor";
import { ProductImage } from "../../../components/ProductImage";
import { getCollectorStatuses, searchCollectionCandidates } from "../../../lib/collector";
import { getFrenchNames, getPreferredDisplayName } from "../../../lib/display-name";
import type { SearchParamRecord } from "../../../lib/navigation-context";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<SearchParamRecord> };

export default async function QuickAddPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = String(Array.isArray(params.q) ? params.q[0] ?? "" : params.q ?? "").trim();
  const result = await searchCollectionCandidates(query);
  const ids = result.variants.map(({ id }) => id);
  const [frenchNames, statuses] = await Promise.all([getFrenchNames(ids), getCollectorStatuses(ids)]);
  return <div className="page-shell listing-page quick-add-page">
    <Link href="/collection" className="back-link">← Ma collection</Link>
    <section className="page-heading"><span className="eyebrow">Ajout express</span><h1>Ajouter un Playmobil</h1><p>Entrez une référence exacte ou quelques mots du nom. Les détails physiques restent facultatifs.</p></section>
    <form className="filter-form simple" method="get"><label>Référence ou nom<input autoFocus name="q" type="search" defaultValue={query} placeholder="Ex. 70201" /></label><button type="submit">Rechercher</button></form>
    {query && <p className="search-summary">{result.exact ? `${result.variants.length} correspondance${result.variants.length > 1 ? "s" : ""} exacte${result.variants.length > 1 ? "s" : ""}.` : `${result.variants.length} résultat${result.variants.length > 1 ? "s" : ""} par nom ou référence.`} {result.variants.length > 1 && result.exact ? "Choisissez l’édition réellement possédée ; aucune variante n’est choisie arbitrairement." : ""}</p>}
    <section className="quick-add-results">{result.variants.map((variant) => {
      const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
      const status = statuses.get(variant.id);
      const edition = [variant.variantLabel, ...variant.markets.map(({ market }) => market.name)].filter(Boolean).join(" · ");
      return <article className="quick-add-result" key={variant.id}><ProductImage src={variant.media[0]?.sourceUrl ?? null} alt={name} /><div><p className="reference">{variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey}</p><h2>{name}</h2>{edition && <p>{edition}</p>}{status?.inCollection && <p className="form-feedback success">Déjà dans votre collection · {status.quantity} exemplaire{status.quantity > 1 ? "s" : ""}</p>}<QuickCollectionEditor variantId={variant.id} addMode open={result.variants.length === 1} /></div></article>;
    })}</section>
    {query && !result.variants.length && <section className="empty-state"><h2>Aucun résultat</h2><p>Vérifiez la référence ou recherchez par nom dans le catalogue.</p><Link className="button" href={`/catalogue?q=${encodeURIComponent(query)}`}>Rechercher dans le catalogue</Link></section>}
  </div>;
}
