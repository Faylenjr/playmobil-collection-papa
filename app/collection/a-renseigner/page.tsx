import Link from "next/link";
import { redirect } from "next/navigation";
import { CollectionManagedCard } from "../../../components/CollectionManagedCard";
import { BulkCollectionForm } from "../../../components/BulkCollectionForm";
import { PageJump } from "../../../components/PageJump";
import { getCollectionItems, getCollectionQualitySummary, type CollectionFilters } from "../../../lib/collector";
import { getFrenchNames, getPreferredDisplayName } from "../../../lib/display-name";
import { buildInternalUrl, type SearchParamRecord } from "../../../lib/navigation-context";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<SearchParamRecord> };
const allowed = new Set(["all", "condition", "complete", "box", "instructions", "purchaseDate", "purchasePrice"]);

export default async function ReviewCollectionPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.field) ? params.field[0] : params.field;
  const field = allowed.has(raw ?? "") ? raw as NonNullable<CollectionFilters["review"]> : "all";
  const page = Math.max(1, Number.parseInt(String(Array.isArray(params.page) ? params.page[0] : params.page ?? "1"), 10) || 1);
  const [result, quality] = await Promise.all([getCollectionItems({ review: field }, "recent", page), getCollectionQualitySummary()]);
  if (page > result.pages) redirect(buildInternalUrl("/collection/a-renseigner", params, { page: result.pages > 1 ? result.pages : null }));
  const frenchNames = await getFrenchNames(result.items.map(({ variant }) => variant.id));
  const returnTo = buildInternalUrl("/collection/a-renseigner", params, { page: page > 1 ? page : null });
  const filters = [
    ["all", "Tout", quality.needsReview],
    ["condition", "État", quality.condition.unknown], ["complete", "Complet", quality.complete.unknown], ["box", "Boîte", quality.box.unknown], ["instructions", "Notice", quality.instructions.unknown], ["purchaseDate", "Date d’achat", quality.purchaseDate.unknown], ["purchasePrice", "Prix d’achat", quality.purchasePrice.unknown],
  ] as const;
  return <div className="page-shell listing-page">
    <Link href="/collection" className="back-link">← Ma collection</Link>
    <section className="page-heading collector-page-heading"><div><span className="eyebrow">Nettoyage progressif</span><h1>À renseigner</h1><p>Complétez les informations physiques à votre rythme. Une valeur inconnue reste toujours inconnue.</p></div><strong>{result.total}<small>à vérifier</small></strong></section>
    <nav className="filter-chips" aria-label="Filtrer les informations manquantes">{filters.map(([value, label, count]) => <Link key={value} className={field === value ? "active" : ""} href={`/collection/a-renseigner?field=${value}`}>{label} ({count})</Link>)}</nav>
    {result.items.length ? <><BulkCollectionForm /><section className="catalogue-grid collection-management-grid">{result.items.map((item) => {
      const variant = item.variant;
      const name = getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey });
      return <CollectionManagedCard key={item.id} item={item} name={name} returnTo={returnTo} />;
    })}</section><PageJump action="/collection/a-renseigner" currentPage={page} pages={result.pages} params={params} /></> : <section className="empty-state"><span>✓</span><h2>Rien à compléter dans ce filtre</h2><p>Choisissez un autre critère ou revenez à votre collection.</p></section>}
  </div>;
}
