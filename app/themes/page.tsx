import { getThemes } from "../../lib/catalogue";
import { ThemeCard } from "../../components/ThemeCard";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const themes = await getThemes(36);
  return (
    <div className="page-shell listing-page">
      <section className="page-heading themes-heading">
        <span className="eyebrow">Explorer</span>
        <h1>Les thèmes Playmobil</h1>
        <p>Choisissez un univers visuel. Dans chaque thème, les grands sets et les boîtes complètes apparaissent en premier.</p>
      </section>
      <section className="theme-grid" aria-label="Thèmes du catalogue">
        {themes.map((theme) => <ThemeCard theme={theme} key={theme.slug} />)}
      </section>
    </div>
  );
}
