# Audit des contextes commerciaux

Audit réalisé le 6 octobre 2026 sur la base homelab, après la correction qui a ramené les exclusivités géographiques attestées à zéro.

## Corpus et principe

- 5 072 relations `MarketEvidence`, inchangées par ce chantier ;
- 3 696 `SourceRecord` portent une valeur communautaire `exclusive` ;
- 3 678 variantes et 3 590 produits distincts sont concernés ;
- 353 libellés bruts distincts, tous issus de Klickypedia ;
- aucune des 19 `SourceRecord` officielles présentes ne contient une formulation géographique explicite d'exclusivité.

Le mot historique `exclusive` ne devient jamais une exclusivité géographique. Il alimente une dimension séparée `CommercialContext`, tandis que `MarketEvidence` continue de décrire le pays. Une preuve commerciale reste reliée au `SourceRecord` exact, à la source, à la valeur brute, à l'URL, à la raison de classement et à la date d'observation.

## Taxonomie retenue

| Catégorie | Variantes distinctes | Interprétation |
| --- | ---: | --- |
| `MAGAZINE_PUBLICATION` | 1 296 | magazine, revue, bande dessinée, livre ou contenu éditorial explicitement nommé |
| `BRAND_LICENSE_PARTNER` | 1 057 | marque, licence ou partenaire nommé, sans autre assertion plus précise |
| `RETAILER_DISTRIBUTOR` | 338 | enseigne ou distributeur identifié dans le corpus |
| `PROMOTIONAL_CAMPAIGN` | 310 | tag structuré `promotional` ou libellé explicitement promotionnel |
| `ORGANIZATION_ASSOCIATION` | 285 | organisation, association, institution, club ou fédération |
| `EVENT_VENUE` | 219 | salon, événement, FunPark, musée ou lieu explicitement nommé |
| `OTHER_DOCUMENTED_CONTEXT` | 173 | valeur conservée sans interprétation forte suffisante |

Ces ensembles peuvent se chevaucher : un même partenaire peut avoir des variantes explicitement taguées comme promotionnelles et d'autres seulement documentées comme partenariat. La clé canonique combine donc le type et le nom normalisé. L'import produit 381 contextes pour 353 libellés bruts et reste idempotent à 3 696 preuves.

Principaux contextes observés :

- publications : Playmobil Magazin (256 variantes), Playmobil Magazin Pink (176), Playmobil Tu Revista Espagne (170), Die playmos Hörspiel (120) ;
- distributeurs : Kaufhof (48), Vedes (34), Carrefour (32), Idee & Spiel (28), Karstadt et Kaufland (27 chacun) ;
- événements et lieux : Nüremberg International Toy Fair (100), FunPark (67), FunPark Shop Figures (14) ;
- organisations : NHL (76), BVG (41), DFB Stars (38), ADAC (24), ÖFB (15), Cruz Roja (9).

## Pays et compteurs

Les compteurs restent des nombres de variantes distinctes, jamais des nombres de preuves. Après migration :

| Marché | Éditions de marché | Présences | Exclusivités géographiques attestées |
| --- | ---: | ---: | ---: |
| Allemagne | 1 858 | 72 | 0 |
| France | 171 | 6 | 0 |
| Espagne | 464 | 83 | 0 |
| Italie | 65 | 8 | 0 |
| Royaume-Uni | 22 | 0 | 0 |
| États-Unis | 564 | 33 | 0 |

La page d'un pays expose séparément les compteurs géographiques, puis les contextes commerciaux regroupés. Pour l'Allemagne, les groupes couvrent notamment 137 variantes distributeur, 836 publications, 168 événements/lieux et 120 organisations. Les totaux de groupes ne doivent pas être additionnés : une variante peut posséder plusieurs preuves ou contextes.

Le bloc « À chercher en … » utilise la wishlist existante et accepte une édition de marché, un contexte commercial documenté ou une future exclusivité réellement attestée. Chaque ligne indique sa nature exacte ; elle n'affiche jamais « Exclusivité Allemagne » sans preuve.

## Cas de recette demandés

| Référence | Marché | Contexte final | Pourquoi ce n'est pas une exclusivité géographique |
| --- | --- | --- | --- |
| `71390-GER` | Allemagne, `MARKET_EDITION` | distributeur `Kaufland` | le seul fait brut nomme l'enseigne Kaufland |
| `30794404-GER` | Allemagne, `MARKET_EDITION` | publication `Playmobil Magazin Ghostbusters` | la source décrit un numéro/produit de magazine |
| `72259-GER` | Allemagne, `MARKET_EDITION` | organisation `DFB Stars` | DFB est un contexte fédération/collection, sans assertion « Allemagne uniquement » |
| `4060-GER` | Allemagne, `MARKET_EDITION` | distributeur `Idee & Spiel` | le libellé nomme un réseau de distribution |
| `11608-GER` | Allemagne, `MARKET_EDITION` | partenaire/licence `Ravensburger` | la source décrit un puzzle lié à Ravensburger |
| `70720-GER` | Allemagne, `MARKET_EDITION` | organisation `Cruz Roja` | la source nomme l'organisation ; elle ne limite pas géographiquement la vente |

Chaque ligne conserve l'URL Klickypedia et le `SourceRecord` d'origine. Le suffixe `GER` établit uniquement le marché de la variante.

## Recherche de vraies exclusivités

- confirmées par une source officielle déjà stockée : **0** ;
- candidates communautaires : 75 variantes « Exclusive Greece LYRA » et 15 variantes « Exclusive Brazil TROL » ;
- non prouvées : toutes ces candidates restent `OTHER_DOCUMENTED_CONTEXT` et ne créent aucun `ATTESTED_EXCLUSIVE`.

Une future exclusivité ne pourra être créée que depuis une `SourceRecord` officielle contenant une formulation explicite et rattachée au marché concerné (`Germany only`, `nur in Deutschland`, `exclusivement disponible…`, etc.). Une page nationale, un suffixe pays, une enseigne ou une traduction ne suffisent pas.

## Reproduction

- `pnpm commercial-contexts:audit` : audit en lecture seule du corpus et des formulations officielles ;
- `pnpm commercial-contexts:dry-run` : volume et répartition prévus ;
- `pnpm commercial-contexts:apply` : matérialisation idempotente avec provenance.

Le modèle est compatible avec les identifiants/EAN, les prix par marché et les offres : une variante peut maintenant combiner « marché Allemagne », « partenaire Kaufland », prix officiel DE, offres allemandes et statut wishlist sans être qualifiée d'exclusivité géographique.
