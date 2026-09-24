import Link from "next/link";
import { getThemes } from "../../lib/catalogue";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const themes = await getThemes(36);
  return (
    <div className="page-shell listing-page">
      <section className="page-heading">
        <span className="eyebrow">Explorer</span>
        <h1>Les thèmes Playmobil</h1>
        <p>Choisissez un univers. Les grands sets et les boîtes complètes apparaissent en premier.</p>
      </section>
      <section className="theme-grid" aria-label="Thèmes du catalogue">
        {themes.map((theme) => (
          <Link className="theme-card" href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`} key={theme.slug}>
            <strong>{theme.name}</strong>
            <span>{theme.count.toLocaleString("fr-FR")} objet{theme.count > 1 ? "s" : ""}</span>
            <b>Explorer ce thème →</b>
          </Link>
        ))}
      </section>
    </div>
  );
}
