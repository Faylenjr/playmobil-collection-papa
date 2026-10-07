# Couverture des prix officiels

## Sémantique

`ListPriceObservation` conserve une observation horodatée du prix catalogue affiché par une source PLAYMOBIL officielle, par marché. Les observations ne sont jamais remplacées.

- `validUntil = NULL` : dernière observation officielle encore considérée courante.
- `validUntil` renseigné : dernier prix officiel connu pour une page explicitement archivée.
- lorsqu'une page affiche un prix barré et un prix remisé, le prix barré alimente `ListPriceObservation`; le prix remisé reste une offre courante officielle et ne sert pas de faux prix catalogue.
- une promotion n'est calculée qu'avec un prix officiel courant, une offre neuve fraîche, le même marché et la même devise.
- le badge compare le prix de l'article hors livraison; le classement compare le total livré lorsqu'il est connu.

## File prioritaire

`pnpm prices:priority:plan` construit une file dédupliquée, sans réseau ni écriture :

1. wishlist du collectionneur principal;
2. références avec offre active;
3. 50 nouveautés récentes;
4. références 2026;
5. collection récente.

Le cycle contrôlé est limité à 120 références par défaut, soit au maximum deux pages officielles par référence (France et Allemagne). `pnpm prices:priority:refresh` produit uniquement le snapshot d'audit. `pnpm prices:priority:dry-run` vérifie l'identité et simule l'import. L'écriture n'est autorisée qu'avec `pnpm prices:priority:apply` après sauvegarde validée.

## Kelkoo et Koupobol

`pnpm commerce:kelkoo:test --references=71592,70201` est un smoke-test explicite et sans écriture. Sans jeton Publisher, il rend un état bloqué clair.

Koupobol reste un lien externe ou une source de découverte autorisée. Aucun prix n'est copié ou aspiré sans feed, API ou accord.
