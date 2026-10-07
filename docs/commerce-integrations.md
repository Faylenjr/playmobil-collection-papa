# Intégrations commerce

État au 7 octobre 2026. Les clients HTTP, le matching, le dry-run et la
persistance idempotente sont implémentés. Aucun appel marchand n'est actif sans
credentials et aucun résultat simulé n'est écrit en base.

## Kelkoo — neuf en France

La documentation Publisher officielle décrit une Shopping API et des feeds en
JSON, XML ou CSV. L'accès passe par un compte Publisher approuvé et un jeton JWT
du Publisher Center. Les droits et quotas sont propres à chaque pays ; pour ce
projet, la configuration reste limitée à la France (`KELKOO_COUNTRY=fr`).

Sources : [documentation Publisher](https://docs.kelkoogroup.com/for-publishers),
[construction d'une requête](https://docs.kelkoogroup.com/for-publishers/quick-starts/how-to-build-a-shopping-api-or-reporting-api-request),
[schéma des offres](https://docs.kelkoogroup.com/for-publishers/shopping-api-feeds/feeds-offers/offers-feeds-response).

Variables attendues :

- `KELKOO_PUBLISHER_TOKEN` ;
- `KELKOO_COUNTRY=fr`.

Test contrôlé (20 références 2026 par défaut) :

```bash
pnpm commerce:refresh:kelkoo
pnpm commerce:refresh:kelkoo -- --limit=20 --apply
```

La première commande est un dry-run. La seconde n'écrit que si l'échantillon
contient au moins une réponse et un match accepté, sans erreur fournisseur.

Le matching automatique accepte, dans cet ordre : EAN exact ; puis référence
exacte isolée avec marque structurée `PLAYMOBIL`. Les autres réponses sont rejetées
ou envoyées en revue. Le coût livré n'est calculé que si le port est connu.

## eBay — neuf ancien et occasion

L'adaptateur cible la Browse API officielle, via OAuth client credentials, avec
`EBAY_FR` ou `EBAY_DE`. L'accès réseau réel n'est pas activé tant que les clés et
l'éligibilité production ne sont pas disponibles.

Source : [eBay Browse API](https://developer.ebay.com/develop/api/buy/browse_api).

Variables attendues :

- `EBAY_CLIENT_ID` ;
- `EBAY_CLIENT_SECRET` ;
- `EBAY_ENVIRONMENT=sandbox|production` ;
- `EBAY_MARKETPLACE_ID=EBAY_FR|EBAY_DE`.

Test contrôlé France :

```bash
pnpm commerce:refresh:ebay
pnpm commerce:refresh:ebay -- --limit=20 --apply
```

`EBAY_DE` est volontairement refusé par le script de cette première phase. Il
sera activé séparément après validation du corpus français et de la livraison.

Le matching accepte un EAN/GTIN structuré exact, ou le couple marque PLAYMOBIL et
référence exacte isolée dans le titre. Une réponse par mots-clés seuls reste un
candidat refusé. Les états neuf/scellé et occasion demeurent séparés ; l'occasion
ne génère jamais de pourcentage de promotion.

## Leboncoin et Dealabs

Ils restent de simples liens de recherche manuelle par référence. Aucun endpoint
privé ni scraping n'est utilisé, et aucune ligne `Offer` n'est créée.

## Fraîcheur et promotion

`PriceObservation` est append-only. Une promotion n'est calculée que pour une offre
`NEW` ou `SEALED`, fraîche, dans la même devise et le même marché qu'un prix officiel
fiable. Le pourcentage exact est affiché ; les seuils de mise en avant restent une
présentation, pas une vérité commerciale.

Une offre est fraîche pendant 24 heures. Un rafraîchissement réussi met à jour
`lastObservedAt`; une offre qui disparaît du périmètre rafraîchi devient `ENDED`
avec une date d'expiration, sans suppression de l'offre ni de son historique.
La cadence automatique ne doit être choisie qu'après connaissance des quotas :
quelques heures pour Kelkoo si le contrat l'autorise, et une cadence adaptée aux
quotas Browse pour eBay.

## Interface

- la fiche affiche uniquement les offres disponibles et fraîches, avec coût
  livré et date de vérification ;
- `Mes recherches` affiche en une requête groupée le prix officiel FR, le
  meilleur neuf et la meilleure occasion ;
- `/bons-plans` est limité aux offres neuves/scellées fraîches dont la promotion
  est comparable au prix officiel du même marché et de la même devise.

## État d'activation

Au 7 octobre 2026, `KELKOO_PUBLISHER_TOKEN`, `EBAY_CLIENT_ID` et
`EBAY_CLIENT_SECRET` sont absents du homelab. Les commandes s'arrêtent donc avec
un blocage explicite avant tout appel réseau ou toute écriture. Après ajout des
secrets hors Git, exécuter d'abord le dry-run de 20 références et contrôler les
marchands, EAN, frais de port, URLs, états et rejets avant `--apply`.
