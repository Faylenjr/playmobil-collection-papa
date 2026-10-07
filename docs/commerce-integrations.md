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
`EBAY_FR` ou `EBAY_DE`. Le keyset Production est actif sur le homelab ; les
secrets restent exclusivement dans son fichier `.env` non versionné.

Source : [eBay Browse API](https://developer.ebay.com/develop/api/buy/browse_api).

Variables attendues :

- `EBAY_CLIENT_ID` ;
- `EBAY_CLIENT_SECRET` ;
- `EBAY_ENVIRONMENT=sandbox|production` ;
- `EBAY_MARKETPLACE_ID=EBAY_FR|EBAY_DE` ;
- `EBAY_DELIVERY_POSTAL_CODE` (optionnel, recommandé pour fiabiliser le port) ;
- `EBAY_ACCOUNT_DELETION_ENDPOINT` ;
- `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN` (32 a 80 caracteres, secret hors Git).

Le keyset Production doit etre abonne aux notifications de suppression de compte
eBay avant son premier appel. Le callback
`/api/ebay/account-deletion` repond au challenge officiel, accuse reception des
notifications valides et ne journalise ni ne conserve leurs identifiants. Le
catalogue ne stocke aucun compte ni aucune donnee personnelle de membre eBay ;
les offres publiques et leurs prix restent independants de ces identifiants.

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

La recherche filtre le pays de livraison correspondant à la marketplace. Quand
un code postal est configuré, il est aussi envoyé dans le contexte acheteur afin
qu'eBay puisse calculer des frais de port plus précis. Les états sont normalisés
en priorité depuis le `conditionId` stable d'eBay, et non depuis le libellé
localisé (`Neuf`, `Occasion`, `Neu`, etc.). Aucun libellé libre ne suffit à
inventer l'état `SEALED`.

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

Sur le homelab, le pilote eBay est limité à 20 références commerciales et tourne
toutes les six heures via `playmobil-ebay-refresh.timer`. Cela représente au plus
80 recherches par jour, hors jetons OAuth. Une réponse fournisseur vide ou en
erreur bloque l'écriture ; les offres absentes d'un rafraîchissement réussi sont
marquées terminées, jamais supprimées. État et journaux :

```bash
systemctl status playmobil-ebay-refresh.timer
journalctl -u playmobil-ebay-refresh.service -n 100 --no-pager
```

## Interface

- la fiche affiche uniquement les offres disponibles et fraîches, avec coût
  livré et date de vérification ;
- `Mes recherches` affiche en une requête groupée le prix officiel FR, le
  meilleur neuf et la meilleure occasion ;
- `/bons-plans` est limité aux offres neuves/scellées fraîches dont la promotion
  est comparable au prix officiel du même marché et de la même devise.

## État d'activation

Au 7 octobre 2026, Kelkoo reste inactif faute de jeton Publisher. eBay Production
est configuré et son callback de conformité est validé. Le premier dry-run de
20 références commerciales réelles a reçu 14 annonces, toutes acceptées par la
règle marque + référence exacte ; l'écriture reste précédée d'une sauvegarde et
d'un second contrôle après normalisation des états localisés.
