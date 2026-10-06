# Intégrations commerce

État au 6 octobre 2026. Les adaptateurs produisent des candidats vérifiables ;
aucun appel marchand n'est actif sans credentials.

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
