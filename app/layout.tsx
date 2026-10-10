import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileBottomNav } from "../components/MobileBottomNav";
import { PwaClient } from "../components/PwaClient";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://playmobil.homeclap.ovh"),
  title: { default: "Playmobil Collection", template: "%s · Playmobil Collection" },
  description: "Le carnet personnel pour gérer une collection Playmobil.",
  applicationName: "Playmobil Collection",
  icons: {
    icon: [{ url: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/app-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Playmobil" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#06234a", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <PwaClient />
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
            <Link href="/collection/inventaire">Inventaire</Link>
            <Link href="/collection/ajouter">+ Ajouter</Link>
            <Link href="/catalogue">Catalogue</Link>
            <Link href="/nouveautes">Nouveautés</Link>
            <Link href="/gammes">Gammes</Link>
            <Link href="/pays">Pays</Link>
            <Link href="/bons-plans">Bons plans</Link>
            <Link href="/recherches">Mes recherches</Link>
            <Link href="/themes">Thèmes</Link>
          </nav>
          <details className="mobile-menu"><summary>Menu</summary><nav aria-label="Navigation mobile"><Link href="/">Accueil</Link><Link href="/collection">Ma collection</Link><Link href="/collection/inventaire">Mode inventaire</Link><Link href="/collection/vitrine">Ma vitrine</Link><Link href="/collection/ajouter">+ Ajouter un Playmobil</Link><Link href="/catalogue">Catalogue</Link><Link href="/nouveautes">Nouveautés</Link><Link href="/gammes">Gammes</Link><Link href="/pays">Pays</Link><Link href="/bons-plans">Bons plans</Link><Link href="/recherches">Mes recherches</Link><Link href="/themes">Thèmes</Link></nav></details>
        </header>
        <main>{children}</main>
        <MobileBottomNav />
        <footer><strong>Mon carnet Playmobil</strong><span>Catalogue personnel non commercial · Données issues des sources référencées</span></footer>
      </body>
    </html>
  );
}
