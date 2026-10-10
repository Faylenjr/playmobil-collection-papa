import Link from "next/link";
import { InventorySession, type InventoryItem } from "../../../components/InventorySession";
import { getInventoryItems, getInventoryOptions, getCollectionQualitySummary } from "../../../lib/collector";
import { getFrenchNames, getPreferredDisplayName } from "../../../lib/display-name";
import { inventoryStorageKey, parseInventoryScope } from "../../../lib/collection-inventory";
import { getFrenchThemeName } from "../../../lib/theme-names";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InventoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const started = single(params.start) === "1";
  const scope = parseInventoryScope(single(params.scope));
  const value = single(params.value).trim();
  const [options, quality] = await Promise.all([getInventoryOptions(), getCollectionQualitySummary()]);
  if (!started) {
    const href = (selection: string, selectionValue = "") => `/collection/inventaire?scope=${selection}${selectionValue ? `&value=${encodeURIComponent(selectionValue)}` : ""}&start=1`;
    const objectLabel = (count: number) => `${count} exemplaire${count > 1 ? "s" : ""}`;
    return <div className="page-shell listing-page inventory-start-page"><Link href="/collection" className="back-link">← Ma collection</Link><section className="page-heading collector-page-heading collection-heading"><div><span className="eyebrow">Inventaire physique guidé</span><h1>Que voulez-vous vérifier ?</h1><p>Un objet à la fois, sans obligation de tout renseigner. Votre position est conservée sur ce téléphone.</p></div><strong>{options.physicalMissing}<small>à compléter</small></strong></section>
      <section className="inventory-quality-strip inventory-quality-overview"><strong>Informations restantes</strong><span>État : {quality.condition.unknown}</span><span>Complet : {quality.complete.unknown}</span><span>Boîte : {quality.box.unknown}</span><span>Notice : {quality.instructions.unknown}</span></section>
      <section className="inventory-selection-grid"><Link href={href("missing")}><strong>À renseigner</strong><span>{objectLabel(options.physicalMissing)}</span><small>État, complétude, boîte ou notice manquants</small></Link><Link href={href("all")}><strong>Toute la collection</strong><span>{objectLabel(options.total)}</span><small>Parcourir sans filtre</small></Link><Link href={href("condition")}><strong>État inconnu</strong><span>{objectLabel(quality.condition.unknown)}</span></Link><Link href={href("complete")}><strong>Complétude inconnue</strong><span>{objectLabel(quality.complete.unknown)}</span></Link><Link href={href("box")}><strong>Boîte inconnue</strong><span>{objectLabel(quality.box.unknown)}</span></Link><Link href={href("instructions")}><strong>Notice inconnue</strong><span>{objectLabel(quality.instructions.unknown)}</span></Link></section>
      <section className="inventory-filter-groups"><article><h2>Par thème</h2><div>{options.themes.map((theme) => <Link key={theme.slug} href={href("theme", theme.slug)}><strong>{getFrenchThemeName(theme)}</strong><span>{objectLabel(theme.total)} · {theme.missing} à renseigner</span></Link>)}</div></article><article><h2>Par gamme</h2><div>{options.ranges.map((range) => <Link key={range.slug} href={href("range", range.slug)}><strong>{range.name}</strong><span>{objectLabel(range.total)} · {range.missing} à renseigner</span></Link>)}</div></article><article><h2>Par année</h2><div>{options.years.map((year) => <Link key={year.year} href={href("year", String(year.year))}><strong>{year.year}</strong><span>{objectLabel(year.total)} · {year.missing} à renseigner</span></Link>)}</div></article></section>
    </div>;
  }
  const rows = await getInventoryItems(scope, value);
  const frenchNames = await getFrenchNames(rows.map(({ variant }) => variant.id));
  const items: InventoryItem[] = rows.map((item) => {
    const variant = item.variant;
    const markets = variant.markets.map(({ market }) => market.name);
    const hasMultipleVariants = variant.product._count.variants > 1;
    const variantDescription = variant.variantLabel?.trim() || (markets.length ? `Édition ${markets.join(", ")}` : null);
    return { id: item.id, variantId: variant.id, copyIndex: item.copyIndex, copyTotal: item.copyTotal, condition: item.condition, isComplete: item.isComplete, hasBox: item.hasBox, hasInstructions: item.hasInstructions, notes: item.notes, name: getPreferredDisplayName({ frenchName: frenchNames.get(variant.id), variantName: variant.name, productName: variant.product.name, fallback: variant.canonicalKey }), reference: variant.references[0]?.displayValue ?? variant.product.baseReference ?? variant.canonicalKey, year: variant.releaseYear ?? variant.product.releaseYear, theme: variant.themes[0]?.theme.name ?? null, imageUrl: variant.media[0]?.sourceUrl ?? null, variantDescription, needsVariantReview: hasMultipleVariants && !variantDescription };
  });
  return <div className="page-shell listing-page"><InventorySession initialItems={items} storageKey={inventoryStorageKey(scope, value)} initialCounters={{ condition: quality.condition.unknown, complete: quality.complete.unknown, box: quality.box.unknown, instructions: quality.instructions.unknown }} /></div>;
}
