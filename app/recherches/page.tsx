import Link from "next/link";
import { addToCollection, removeFromWishlist, updateWishlistItem } from "../actions/collector";
import { ProductImage } from "../../components/ProductImage";
import { getWishlistItems } from "../../lib/collector";
import { getFrenchNames, getPreferredDisplayName } from "../../lib/display-name";
import { PageJump } from "../../components/PageJump";
import { buildInternalUrl, productHref, type SearchParamRecord } from "../../lib/navigation-context";
import { redirect } from "next/navigation";
import { getVariantPriceHighlights } from "../../lib/discovery";

type Props = { searchParams: Promise<SearchParamRecord> };
export const dynamic = "force-dynamic";

const priorityLabel = ["Normale", "Souhaitée", "Importante", "Prioritaire"];

export default async function WishlistPage({ searchParams }: Props) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const query = single(params.q).trim();
  const page = Math.max(1, Number.parseInt(single(params.page) || "1", 10) || 1);
  const result = await getWishlistItems(query, page);
  if (page > result.pages) redirect(buildInternalUrl("/recherches", params, { page: result.pages > 1 ? result.pages : null }));
  const variantIds = result.items.map(({ variant }) => variant.id);
  const [frenchNames, priceHighlights] = await Promise.all([getFrenchNames(variantIds), getVariantPriceHighlights(variantIds)]);
  const returnTo = buildInternalUrl("/recherches", params, { page: page > 1 ? page : null });
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    return suffix ? `/recherches?${suffix}` : "/recherches";
  };
  return (
    <div className="page-shell listing-page">
      <section className="page-heading collector-page-heading wishlist-heading"><div><span className="eyebrow">Liste de souhaits</span><h1>Mes recherches</h1><p>Les boîtes que je souhaite trouver pour compléter ma collection.</p></div><strong>{result.total.toLocaleString("fr-FR")}<small>objet{result.total > 1 ? "s" : ""}</small></strong></section>
      <form className="filter-form simple" method="get"><label>Rechercher<input name="q" type="search" defaultValue={query} placeholder="Nom ou référence…" /></label><button type="submit">Rechercher</button></form>
      {result.items.length ? <><section className="wishlist-list" aria-label="Objets recherchés">{result.items.map((item) => {
        const variant = item.variant;
        const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
        const add = addToCollection.bind(null, variant.id);
        const remove = removeFromWishlist.bind(null, variant.id);
        const update = updateWishlistItem.bind(null, variant.id);
        const pricing = priceHighlights.get(variant.id);
        const officialFr = pricing?.listPrices.find(({ market }) => market.code === "FRANCE");
        const bestNew = pricing?.bestNew;
        const newObservation = bestNew?.observations[0];
        const bestUsed = pricing?.bestUsed;
        const usedObservation = bestUsed?.observations[0];
        return <article className={`wishlist-row priority-${item.priority}`} key={item.id}>
          <Link className="wishlist-image" href={productHref(variant.id, returnTo)}><ProductImage src={variant.media[0]?.sourceUrl ?? null} alt={name} /></Link>
          <div><p className="reference">{variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey}</p><h2><Link href={productHref(variant.id, returnTo)}>{name}</Link></h2><p className="priority-label">Priorité : <strong>{priorityLabel[item.priority] ?? "Normale"}</strong></p>{item.notes && <p className="item-notes">{item.notes}</p>}<div className="wishlist-prices">{officialFr && <span>Prix officiel FR <strong>{formatMoney(Number(officialFr.amount), officialFr.currency)}</strong></span>}{newObservation && <span>Meilleur neuf <strong>{formatMoney(Number(newObservation.totalPrice ?? newObservation.itemPrice), newObservation.currency)}</strong>{bestNew.promotion !== null && bestNew.promotion > 0 && <em>−{Math.round(bestNew.promotion * 100)} %</em>}</span>}{usedObservation && <span>Meilleure occasion <strong>{formatMoney(Number(usedObservation.totalPrice ?? usedObservation.itemPrice), usedObservation.currency)}</strong></span>}{!officialFr && !newObservation && !usedObservation && <small>Aucune offre suivie pour le moment.</small>}</div></div>
          <div className="wishlist-actions">
            <form action={update}><label>Priorité<select name="priority" defaultValue={item.priority}><option value="0">Normale</option><option value="1">Souhaitée</option><option value="2">Importante</option><option value="3">Prioritaire</option></select></label><label>Note<input name="notes" defaultValue={item.notes ?? ""} /></label><button type="submit">Enregistrer</button></form>
            <form action={add}><button className="primary-action" type="submit">Passer dans ma collection</button></form>
            <form action={remove}><button className="text-action" type="submit">Retirer de mes recherches</button></form>
          </div>
        </article>;
      })}</section>{result.pages > 1 && <nav className="pagination simple-pagination" aria-label="Pagination des recherches">{page > 1 ? <Link href={pageHref(page - 1)}>← Précédente</Link> : <span aria-disabled="true">← Précédente</span>}<span>Page {page} sur {result.pages}</span>{page < result.pages ? <Link href={pageHref(page + 1)}>Suivante →</Link> : <span aria-disabled="true">Suivante →</span>}</nav>}<PageJump action="/recherches" currentPage={page} pages={result.pages} params={params} /></> : <section className="empty-state collector-empty wanted-empty"><span aria-hidden="true">♡</span><h2>Aucune recherche pour le moment</h2><p>Ajoutez les boîtes qui vous intéressent depuis le catalogue.</p><Link className="button" href="/catalogue">Explorer le catalogue</Link></section>}
    </div>
  );
}

function formatMoney(amount: number, currency: string) {
  return amount.toLocaleString("fr-FR", { style: "currency", currency });
}
