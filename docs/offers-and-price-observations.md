# Architecture prix et offres

Ce document décrit désormais le socle implémenté. Aucun scraper ni import marchand n'est activé sans accès API autorisé.

## Modèle proposé

### `Retailer`

Identité du vendeur ou de la marketplace : nom, type (`SHOP`, `MARKETPLACE`, `PRIVATE_LISTING`), URL, pays, devise habituelle et source/API utilisée.

### `Offer`

Une annonce courante reliée exactement soit à un `Product`, soit à un `ProductVariant` : identifiant externe stable, vendeur, état (`NEW`, `USED`, `SEALED`, `UNKNOWN`), URL d'achat, disponibilité, date de première/dernière observation et date d'expiration. L'identité est `(retailerId, externalId)` ; une contrainte SQL impose une seule cible et une URL HTTPS. Une recherche textuelle ne suffit jamais à créer une association automatique avec un Playmobil.

### `PriceObservation`

Historique append-only : `offerId`, prix de l'article, frais de port connus, total calculable, devise, disponibilité et `observedAt`. Le total reste inconnu si la livraison dépend d'une adresse ou n'est pas fournie. Les anciennes observations ne sont pas écrasées.

### Prix conseillé

Le champ historique `ProductVariant.listPrice` est conservé pour compatibilité, mais la nouvelle table append-only `ListPriceObservation` porte obligatoirement le marché, la devise, la source, l'URL, la date d'observation et éventuellement la période de validité. Une remise n'est affichée que si devise et marché sont comparables : `(listPrice - currentPrice) / listPrice`.

## Fraîcheur et affichage

- boutique : observation fraîche au plus 24 h, sinon étiquette « vérifié il y a … » ;
- marketplace d'occasion : seuil plus court si l'API le permet, car une annonce peut disparaître rapidement ;
- une offre indisponible est archivée, jamais supprimée de l'historique ;
- séparer neuf et occasion ;
- trier sur le total uniquement quand livraison et devise sont connues ;
- conserver URL, valeur brute, timestamp et réponse source minimale nécessaire à l'audit, dans les limites de la licence de l'API.

## Intégrations vérifiées

### eBay

Le Browse API officiel permet la recherche d'annonces et expose prix, état, livraison, disponibilité et URL. Tous ses appels utilisent un jeton OAuth d'application (client credentials). Le bac à sable est accessible avec un compte développeur, mais l'accès Buy API en production est restreint : candidature/validation eBay, et selon le modèle affiliation eBay Partner Network, revue de l'expérience et contrats. Il n'existe aucune garantie d'approbation. Le dépôt contient un adaptateur injectable et testé, désactivé tant que `EBAY_CLIENT_ID` et `EBAY_CLIENT_SECRET` ne sont pas configurés ; aucun appel réseau ni import n'est effectué aujourd'hui.

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

1. configurer un keyset eBay Sandbox dans les secrets du homelab ;
2. brancher le client HTTP Browse API sur l'interface `EbayBrowseClient` et conserver le dry-run ;
3. faire revoir tout résultat sans référence commerciale exacte isolée ;
4. demander l'accès production eBay et n'activer l'écriture qu'après approbation ;
5. ajouter ensuite des flux de boutiques partenaires autorisés ;
6. laisser Leboncoin et Dealabs en liens manuels tant qu'aucun accès officiel n'est obtenu.

Le chantier actuel ajoute `Retailer`, `Offer`, `PriceObservation` et `ListPriceObservation`, ainsi que l'interface et les tests de matching. Il n'effectue aucun appel automatisé à une marketplace et n'invente aucun prix.
