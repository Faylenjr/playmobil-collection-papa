import Link from "next/link";
import { getCollectorSummary } from "../lib/collector";
import { getThemes } from "../lib/catalogue";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [summary, themes] = await Promise.all([getCollectorSummary(), getThemes(8)]);
  return <div className="page-shell home-page">
    <section className="home-hero"><span className="eyebrow">Mon carnet Playmobil</span><h1>Retrouver, classer et compléter ma collection</h1><p>Un espace simple pour savoir ce que je possède et ce que je recherche.</p></section>
    <section className="dashboard-grid">
      <article className="dashboard-card collection"><span>Ma collection</span><strong>{summary.collection.toLocaleString("fr-FR")}</strong><small>objets possédés</small><Link href="/collection">Voir ma collection</Link></article>
      <article className="dashboard-card wishlist"><span>Mes recherches</span><strong>{summary.wishlist.toLocaleString("fr-FR")}</strong><small>objets recherchés</small><Link href="/recherches">Voir la liste</Link></article>
      <article className="dashboard-card catalogue"><span>Catalogue</span><strong>{summary.catalogue.toLocaleString("fr-FR")}</strong><small>références disponibles</small><Link href="/catalogue">Explorer le catalogue</Link></article>
    </section>
    <section className="home-themes"><div className="section-title"><div><span className="eyebrow">Par univers</span><h2>Explorer par thème</h2></div><Link href="/themes">Voir tous les thèmes →</Link></div><div className="theme-grid compact">{themes.map((theme) => <Link className="theme-card" href={`/catalogue?theme=${encodeURIComponent(theme.slug)}`} key={theme.slug}><strong>{theme.name}</strong><span>{theme.count.toLocaleString("fr-FR")} objet{theme.count > 1 ? "s" : ""}</span></Link>)}</div></section>
  </div>;
}
