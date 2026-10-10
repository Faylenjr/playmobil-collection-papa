# PWA et usage mobile

## Origine et authentification

L'origine installable est `https://playmobil.homeclap.ovh`. Cloudflare Access reste la barrière d'authentification : le manifest, les icônes et le service worker sont servis par la même origine après authentification. Le service worker ne contourne jamais Access et ne met pas en cache les routes `/cdn-cgi/` ni une page de connexion.

Après expiration de la session Access, une navigation reste `network-first` et suit donc le flux Google normal. Aucun document d'authentification n'est enregistré dans le cache applicatif.

## Cache et hors connexion

La version initiale conserve seulement :

- l'écran explicatif hors connexion ;
- les icônes de l'application ;
- les fichiers statiques Next.js déjà demandés ;
- les drapeaux et autres assets statiques déjà demandés.

Les pages dynamiques (`collection`, `recherches`, formulaires, catalogue) restent `network-first` et ne sont pas stockées comme données fraîches. Les requêtes non `GET` ne sont jamais interceptées. Une mutation hors connexion échoue donc normalement et l'interface rappelle qu'une connexion est nécessaire ; il n'existe pas de file d'écriture silencieuse.

## Installation

- Chromium/Android : le composant d'installation utilise `beforeinstallprompt` lorsque le navigateur le propose.
- iPhone/iPad : une aide courte indique `Partager → Ajouter à l'écran d'accueil`.
- une fois installée, ou après « Plus tard », l'aide n'est plus affichée de manière répétitive sur l'appareil.

Le manifest expose quatre raccourcis : ajout express, collection, recherches et nouveautés. Les icônes sont une création originale du projet et ne reprennent pas le logo officiel PLAYMOBIL.

## Navigation mobile

La barre inférieure contient Accueil, Catalogue, Collection, Recherches et Plus. Le menu Plus regroupe ajout express, inventaire, vitrine, nouveautés, gammes, thèmes, pays et statistiques. Les safe areas iOS/Android sont prises en compte en haut et en bas.

## Notifications futures

Les notifications push ne sont pas activées et aucune permission n'est demandée. Une phase ultérieure pourra évaluer des alertes explicites pour une baisse de prix, une offre wishlist ou une nouvelle vague, avec consentement séparé.
