import { getThemes } from "../../lib/catalogue";
import { ThemeCard } from "../../components/ThemeCard";
import { getCollectorCategories } from "../../lib/discovery";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const [themes, collectorCategories] = await Promise.all([getThemes(36), getCollectorCategories()]);
  return (
    <div className="page-shell listing-page">
      <section className="page-heading themes-heading">
        <span className="eyebrow">Explorer</span>
        <h1>Les thèmes Playmobil</h1>
        <p>Choisissez un univers visuel. Dans chaque thème, les grands sets et les boîtes complètes apparaissent en premier.</p>
      </section>
      <nav className="explore-hubs" aria-label="Explorer les thèmes et séries"><Link href="#themes"><strong>Thèmes</strong><span>Les grands univers Playmobil</span></Link><Link href="/gammes"><strong>Gammes & séries</strong><span>Les collections commerciales officielles</span></Link><Link href="/themes/geants-xxl"><strong>Géants / XXL</strong><span>Les grandes figurines de collection</span></Link></nav>
      <section className="theme-grid" id="themes" aria-label="Thèmes du catalogue">
        {themes.map((theme) => <ThemeCard href={`/themes/${theme.slug}`} theme={theme} key={theme.slug} />)}
        {collectorCategories.map((category) => <ThemeCard href={`/themes/${category.slug}`} theme={{ slug: category.slug, name: category.name, count: category.total, imageUrl: category.imageUrl }} key={`collector-${category.slug}`} />)}
      </section>
    </div>
  );
}
