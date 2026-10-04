import Link from "next/link";
import { getCollectorCategories } from "../../lib/discovery";

export const dynamic = "force-dynamic";

export default async function SpecialCollectionsPage() {
  const categories = await getCollectorCategories();
  return <div className="page-shell listing-page">
    <section className="page-heading themes-heading"><span className="eyebrow">Catégories de collectionneur</span><h1>Collections spéciales</h1><p>Des regroupements transversaux fondés sur des données structurées, indépendants des thèmes, pays et vagues de sortie.</p></section>
    <section className="discovery-grid">
      {categories.map((category) => <Link className="discovery-card" href={`/collections-speciales/${category.slug}`} key={category.id}>
        <span className="discovery-icon">XXL</span><div><h2>{category.name}</h2><p>{category.description}</p><strong>{category.total} objets</strong><small>{category.owned} possédés · {category.wanted} recherchés</small></div>
      </Link>)}
    </section>
  </div>;
}
