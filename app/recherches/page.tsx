import Link from "next/link";
import { addToCollection, removeFromWishlist, updateWishlistItem } from "../actions/collector";
import { ProductImage } from "../../components/ProductImage";
import { getWishlistItems } from "../../lib/collector";
import { getFrenchNames, getPreferredDisplayName } from "../../lib/display-name";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };
export const dynamic = "force-dynamic";

const priorityLabel = ["Normale", "Souhaitée", "Importante", "Prioritaire"];

export default async function WishlistPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await getWishlistItems(query, page);
  const frenchNames = await getFrenchNames(result.items.map(({ variant }) => variant.id));
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    return suffix ? `/recherches?${suffix}` : "/recherches";
  };
  return (
    <div className="page-shell listing-page">
      <section className="page-heading"><span className="eyebrow">Liste de souhaits</span><h1>Mes recherches</h1><p>{result.total.toLocaleString("fr-FR")} objet{result.total > 1 ? "s" : ""} recherché{result.total > 1 ? "s" : ""}</p></section>
      <form className="filter-form simple" method="get"><label>Rechercher<input name="q" type="search" defaultValue={query} placeholder="Nom ou référence…" /></label><button type="submit">Rechercher</button></form>
      {result.items.length ? <><section className="wishlist-list">{result.items.map((item) => {
        const variant = item.variant;
        const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
        const add = addToCollection.bind(null, variant.id);
        const remove = removeFromWishlist.bind(null, variant.id);
        const update = updateWishlistItem.bind(null, variant.id);
        return <article className="wishlist-row" key={item.id}>
          <Link className="wishlist-image" href={`/sets/${variant.id}`}><ProductImage src={variant.media[0]?.sourceUrl ?? null} alt={name} /></Link>
          <div><p className="reference">{variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey}</p><h2><Link href={`/sets/${variant.id}`}>{name}</Link></h2><p>Priorité : <strong>{priorityLabel[item.priority] ?? "Normale"}</strong></p>{item.notes && <p className="item-notes">{item.notes}</p>}</div>
          <div className="wishlist-actions">
            <form action={update}><label>Priorité<select name="priority" defaultValue={item.priority}><option value="0">Normale</option><option value="1">Souhaitée</option><option value="2">Importante</option><option value="3">Prioritaire</option></select></label><label>Note<input name="notes" defaultValue={item.notes ?? ""} /></label><button type="submit">Enregistrer</button></form>
            <form action={add}><button className="primary-action" type="submit">Passer dans ma collection</button></form>
            <form action={remove}><button className="text-action" type="submit">Retirer de mes recherches</button></form>
          </div>
        </article>;
      })}</section>{result.pages > 1 && <nav className="pagination simple-pagination" aria-label="Pagination des recherches">{page > 1 ? <Link href={pageHref(page - 1)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}<span>Page {page} sur {result.pages}</span>{page < result.pages ? <Link href={pageHref(page + 1)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}</nav>}</> : <section className="empty-state"><h2>Aucune recherche enregistrée</h2><p>Marquez les objets que vous souhaitez trouver.</p><Link className="button" href="/catalogue">Explorer le catalogue</Link></section>}
    </div>
  );
}
