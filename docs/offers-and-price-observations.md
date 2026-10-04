# Architecture prix et offres

Ce document prépare le comparateur demandé sans activer de scraper ni écrire d'offre en base.

## Modèle proposé

### `Retailer`

Identité du vendeur ou de la marketplace : nom, type (`SHOP`, `MARKETPLACE`, `PRIVATE_LISTING`), URL, pays, devise habituelle et source/API utilisée.

### `Offer`

Une annonce courante reliée à un `ProductVariant` : identifiant externe stable, vendeur, état (`NEW`, `USED`, `SEALED`, `UNKNOWN`), URL d'achat, devise, disponibilité, date de première/dernière observation et date d'expiration. L'identité doit être `(retailerId, externalId)` ; une recherche textuelle ne suffit jamais à créer une association automatique avec un Playmobil.

### `PriceObservation`

Historique append-only : `offerId`, prix de l'article, frais de port connus, total calculable, devise, disponibilité et `observedAt`. Le total reste inconnu si la livraison dépend d'une adresse ou n'est pas fournie. Les anciennes observations ne sont pas écrasées.

### Prix conseillé

Le `listPrice` déjà présent sur `ProductVariant` reste séparé des offres. Sa provenance doit passer par `SourceValue`/`SourceRecord` (marché, URL officielle, date observée). Une remise n'est affichée que si la devise et le marché sont comparables : `(listPrice - currentPrice) / listPrice`.

## Fraîcheur et affichage

- boutique : observation fraîche au plus 24 h, sinon étiquette « vérifié il y a … » ;
- marketplace d'occasion : seuil plus court si l'API le permet, car une annonce peut disparaître rapidement ;
- une offre indisponible est archivée, jamais supprimée de l'historique ;
- séparer neuf et occasion ;
- trier sur le total uniquement quand livraison et devise sont connues ;
- conserver URL, valeur brute, timestamp et réponse source minimale nécessaire à l'audit, dans les limites de la licence de l'API.

## Intégrations vérifiées

### eBay

Le Browse API officiel permet la recherche d'annonces et expose prix, état, livraison, disponibilité et URL. Il utilise OAuth avec jeton d'application. Son accès production est toutefois soumis à l'approbation eBay Buy API / Partner Network et à des règles d'affichage ; le bac à sable est disponible avant approbation. C'est la première intégration propre à envisager, après obtention de l'accès production.

Documentation officielle :

- https://developer.ebay.com/api-docs/buy/api-browse.html
- https://developer.ebay.com/api-docs/buy/buy-requirements.html

### Leboncoin

Aucune API publique officielle de recherche d'annonces de biens de consommation n'a été trouvée dans la documentation publique consultée. Les intégrations visibles sont des partenariats professionnels. Ne pas appeler les endpoints privés du site et ne pas scraper avant autorisation contractuelle ou offre partenaire documentée.

### Dealabs

Aucune API publique officielle de recherche de deals n'a été identifiée. Dealabs doit rester un lien manuel ou une source future explicitement autorisée ; pas de scraping automatique.

### Boutiques

Préférer, dans l'ordre : API officielle, flux marchand/affiliation autorisé, puis saisie manuelle. Chaque adaptateur doit déclarer ses conditions d'utilisation, sa fréquence autorisée et sa politique de conservation.

## Première phase recommandée

1. ajouter les trois tables uniquement quand une première source autorisée est disponible ;
2. intégrer eBay en bac à sable et tester le matching exact par référence avec revue en cas d'ambiguïté ;
3. demander l'accès production ;
4. ajouter ensuite des flux de boutiques partenaires ;
5. laisser Leboncoin et Dealabs hors automatisation tant qu'aucun accès officiel n'est obtenu.

Le chantier actuel n'ajoute donc aucune migration prix et n'effectue aucun appel automatisé à une marketplace.
