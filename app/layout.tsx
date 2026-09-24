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
          <Link href="/catalogue" className="brand" aria-label="Catalogue Playmobil — accueil">
            <span className="brand-mark" aria-hidden="true">P</span>
            <span>
              <strong>Catalogue Playmobil</strong>
              <small>La collection, pièce par pièce</small>
            </span>
          </Link>
          <nav aria-label="Navigation principale">
            <Link href="/catalogue">Catalogue</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer>Catalogue personnel non commercial · Données issues des sources référencées</footer>
      </body>
    </html>
  );
}
