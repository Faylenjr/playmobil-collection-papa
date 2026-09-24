import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-state page-shell">
      <span className="eyebrow">Introuvable</span>
      <h1>Cette fiche n’existe pas.</h1>
      <p>Elle a peut-être changé d’adresse ou n’est plus disponible.</p>
      <Link className="button" href="/catalogue">Retour au catalogue</Link>
    </section>
  );
}
