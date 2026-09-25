import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Catalogue Playmobil", template: "%s · Catalogue Playmobil" },
  description: "Parcourir les sets, variantes et références de la collection Playmobil.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Mon carnet Playmobil — accueil">
            <span className="brand-mark" aria-hidden="true">P</span>
            <span>
              <small>Mon carnet</small>
              <strong>Playmobil</strong>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Navigation principale">
            <Link href="/">Accueil</Link>
            <Link href="/collection">Ma collection</Link>
            <Link href="/catalogue">Catalogue</Link>
            <Link href="/nouveautes">Nouveautés</Link>
            <Link href="/recherches">Mes recherches</Link>
            <Link href="/themes">Thèmes</Link>
          </nav>
          <details className="mobile-menu"><summary>Menu</summary><nav aria-label="Navigation mobile"><Link href="/">Accueil</Link><Link href="/collection">Ma collection</Link><Link href="/catalogue">Catalogue</Link><Link href="/nouveautes">Nouveautés</Link><Link href="/recherches">Mes recherches</Link><Link href="/themes">Thèmes</Link></nav></details>
        </header>
        <main>{children}</main>
        <footer><strong>Mon carnet Playmobil</strong><span>Catalogue personnel non commercial · Données issues des sources référencées</span></footer>
      </body>
    </html>
  );
}
