import Link from "next/link";
import { getCollectorSummary } from "../lib/collector";
import { getThemes } from "../lib/catalogue";
import { ProductImage } from "../components/ProductImage";
import { ThemeCard } from "../components/ThemeCard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [summary, themes] = await Promise.all([getCollectorSummary(), getThemes(8)]);
  const featuredThemes = themes.slice(0, 3);
  const missing = Math.max(0, summary.catalogue - summary.distinctCollection);
  return <div className="page-shell home-page">
    <section className="home-hero">
      <div className="home-hero__copy">
        <span className="eyebrow">Mon carnet de collection</span>
        <h1>Toute ma collection Playmobil, simplement.</h1>
        <p>Je retrouve une boîte, je note ce que je possède et je garde sous la main ce que je recherche.</p>
        <form className="home-search" action="/catalogue" method="get" role="search">
          <label htmlFor="home-search">Rechercher une boîte ou une référence</label>
          <div><input id="home-search" name="q" type="search" placeholder="Ex. 70205, château, pirates…" /><button type="submit">Rechercher</button></div>
        </form>
        <div className="hero-shortcuts"><Link href="/collection">Voir ma collection</Link><Link href="/recherches">Voir mes recherches</Link></div>
      </div>
      <div className="collector-showcase" aria-label="Univers populaires">
        <span className="showcase-label">Univers populaires</span>
        <div className="showcase-shelf">
          {featuredThemes.map((theme, index) => <Link href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`} key={theme.slug} className={`showcase-item showcase-item-${index + 1}`} aria-label={`Explorer ${theme.name}`}><ProductImage src={theme.imageUrl ?? null} alt={`Univers ${theme.name}`} priority={index === 0} /><span>{theme.name}</span></Link>)}
        </div>
        <Link href="/themes" className="showcase-link">Voir tous les thèmes <span aria-hidden="true">→</span></Link>
      </div>
    </section>
    <section className="dashboard-grid">
      <article className="dashboard-card collection"><span className="dashboard-icon" aria-hidden="true">✓</span><div><span>Dans ma collection</span><strong>{summary.collection.toLocaleString("fr-FR")}</strong><small>{summary.distinctCollection.toLocaleString("fr-FR")} référence{summary.distinctCollection > 1 ? "s" : ""} différente{summary.distinctCollection > 1 ? "s" : ""}</small></div><Link href="/collection">Ouvrir ma collection <span aria-hidden="true">→</span></Link></article>
      <article className="dashboard-card wishlist"><span className="dashboard-icon" aria-hidden="true">♡</span><div><span>Je recherche</span><strong>{summary.wishlist.toLocaleString("fr-FR")}</strong><small>objet{summary.wishlist > 1 ? "s" : ""} dans ma liste</small></div><Link href="/recherches">Voir mes recherches <span aria-hidden="true">→</span></Link></article>
      <article className="dashboard-card catalogue"><span className="dashboard-icon" aria-hidden="true">⌕</span><div><span>À découvrir</span><strong>{missing.toLocaleString("fr-FR")}</strong><small>références pas encore en collection</small></div><Link href="/catalogue">Explorer le catalogue <span aria-hidden="true">→</span></Link></article>
    </section>
    <section className="home-themes"><div className="section-title"><div><span className="eyebrow">Par univers</span><h2>Retrouver un thème</h2><p>Les grands univers de la collection, illustrés par les boîtes du catalogue.</p></div><Link href="/themes">Voir tous les thèmes →</Link></div><div className="theme-grid compact">{themes.map((theme) => <ThemeCard theme={theme} compact key={theme.slug} />)}</div></section>
  </div>;
}
