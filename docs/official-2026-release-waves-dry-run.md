# Dry-run officiel des vagues PLAYMOBIL 2026

Exécution du 25 septembre 2026 sur la base réelle, strictement en lecture seule. Aucune migration, table, donnée catalogue, collection, wishlist ou tâche REVIEW n'a été créée ou modifiée.

## Décision

**GO pour un modèle minimal `ProductRange` + `ReleaseWave`, limité à ce corpus officiel.**

Les cinq vagues sont encore accessibles, leurs 43 références sont intégralement reproductibles et les 43 bases correspondent sans ambiguïté à un seul `Product` local. Deux références, `72027` et `72028`, contiennent chacune 12 variants individuels ; elles démontrent que les appartenances de gamme et de vague doivent cibler le `Product` logique par défaut, pas recopier une campagne de boîte sur chaque figurine.

Le GO ne couvre pas un enrichissement scalaire automatique général : les noms officiels peuvent contredire les traductions communautaires et quatre observations `figureCount` demandent une revue. Les dimensions, poids, noms et médias doivent rester un pipeline séparé, avec provenance et conflits.

## Corpus déterministe

- 5 vagues ;
- 43 références uniques ;
- hash SHA-256 du manifeste : `5e8feb7aef6692a93a2178e6a6427c43b47721a755f5f1c2fdde5b3fa22fe4b4` ;
- ordre du manifeste conservé dans `lib/official-release-waves.ts` ;
- ordre actuellement observé dans chaque page également enregistré par le dry-run ;
- deux constructions consécutives à DB et réponses réseau identiques ont produit exactement le même résultat.

## Revalidation des cinq sources

| Vague | HTTP | Titre actuellement observé | Références retrouvées | Manquantes | Parasites dans le contenu éditorial |
| --- | ---: | --- | ---: | ---: | ---: |
| [January & February 2026](https://www.playmobil.com/en-us/blog/january-and-february-2026-releases.html) | 200 | The latest PLAYMOBIL playsets: January & February 2026 releases | 12/12 | 0 | 0 |
| [March 2026](https://www.playmobil.com/en-us/blog/2026-march-releases.html) | 200 | The latest PLAYMOBIL playsets: March 2026 releases | 10/10 | 0 | 0 |
| [Soccer 2026](https://www.playmobil.com/en-us/blog/new-soccer-playsets-for-2026.html) | 200 | New PLAYMOBIL Soccer playsets for 2026: Kick off the action at home | 3/3 | 0 | 0 |
| [Knights 2026](https://www.playmobil.com/en-us/blog/playmobil-knights-2026-new-releases.html) | 200 | The new PLAYMOBIL Knights range: Your kingdom awaits | 8/8 | 0 | 0 |
| [May 2026](https://www.playmobil.com/en-us/blog/may-2026-releases.html) | 200 | The latest PLAYMOBIL playsets: May 2026 releases | 10/10 | 0 | 0 |

Hashes SHA-256 observés, dans le même ordre : `091e7bfa37db45cd20c10080290d141f4345e4264054289f6f17f8f08aa9fe779`, `5bc1a22b7589fb319fb379fd58dbd601ff74098d3de499a99f0b66f0fdde00dba`, `ada3e811de3a96c871194bc82c8a5d6c479e5a170e2930ff4f46cf67688344fa0`, `6eba48bea515b91687430556f384d18fa2d7af344c1b70abcbdba3f3f44810c5a`, `9335dfc0fbd1a5720b683a7abeb51ab7cdbbe42e8cd7505dc02e3592b5570b2a6`.

Ordre des références observé dans les pages le 25 septembre 2026 :

- janvier-février : `72043, 71634, 71720, 72011, 72014, 72012, 72013, 71838, 71839, 71843, 72027, 72028` ;
- mars : `71903, 71904, 71905, 71773, 71775, 71774, 72031, 72034, 72023, 72024` ;
- soccer : `72056, 72057, 72058` ;
- knights : `72112, 72113, 72115, 72114, 72117, 72119, 72118, 72116` ;
- mai : `72070, 72071, 72073, 72061, 72063, 72065, 72062, 71873, 71874, 71875`.

Le parseur limite la détection au contenu éditorial et aux liens/médias visibles. Les identifiants techniques du gabarit, recommandations et scripts de la boutique ne deviennent pas des références de vague.

## Résultat par vague

Les classes ci-dessous comptent des références logiques, pas les 24 figurines internes de Series 29.

| Vague | Réfs | Match produit sûr | Absentes | Multiples entre produits | Bloquées | Couverture | Classes actuelles | Possédées | Wishlist |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Janvier-février | 12 | 12 | 0 | 0 | 0 | 100 % | 5 ACCESSORY, 2 SINGLE_FIGURE, 3 SMALL_SET, 2 VEHICLE_SET | 0 | 0 |
| Mars | 10 | 10 | 0 | 0 | 0 | 100 % | 1 ACCESSORY, 2 FIGURE_PACK, 1 PROMOTIONAL, 2 SINGLE_FIGURE, 3 SMALL_SET, 1 VEHICLE_SET | 0 | 0 |
| Soccer | 3 | 3 | 0 | 0 | 0 | 100 % | 3 SMALL_SET | 0 | 0 |
| Knights | 8 | 8 | 0 | 0 | 0 | 100 % | 1 ACCESSORY, 2 BUILDING_SET, 5 SMALL_SET | 0 | 0 |
| Mai | 10 | 10 | 0 | 0 | 0 | 100 % | 5 ACCESSORY, 2 BUILDING_SET, 1 SMALL_SET, 2 VEHICLE_SET | 0 | 0 |

## Manifeste local détaillé

Légende : `FR local` indique qu'un nom français existe déjà ; `boîte` indique un média local `box_front` ou `box_back`. Toutes les lignes ont une identité `ASSIGNED`, une `baseReference` égale à la référence officielle et aucune présence collection/wishlist.

| Vague | Réf. | Matching | Variant canonique | Thème actuel | Classe | FR local | Boîte | Page FR | Page DE |
| --- | --- | --- | --- | --- | --- | :---: | :---: | :---: | :---: |
| Jan-fév. | 71634 | MATCH_UNIQUE | 71634 | Racing | ACCESSORY | oui | oui | oui | oui |
| Jan-fév. | 71720 | MATCH_UNIQUE | 71720 | Action | VEHICLE_SET | oui | oui | oui | oui |
| Jan-fév. | 71838 | MATCH_UNIQUE | 71838 | Magic | SMALL_SET | non | oui | oui | oui |
| Jan-fév. | 71839 | MATCH_UNIQUE | 71839 | Fairies | ACCESSORY | oui | oui | oui | oui |
| Jan-fév. | 71843 | MATCH_UNIQUE | 71843 | Fairies | ACCESSORY | oui | oui | oui | oui |
| Jan-fév. | 72011 | MATCH_UNIQUE | 72011 | Space | VEHICLE_SET | oui | oui | oui | oui |
| Jan-fév. | 72012 | MATCH_UNIQUE | 72012 | Space | SMALL_SET | oui | oui | non | oui |
| Jan-fév. | 72013 | MATCH_UNIQUE | 72013 | Space | ACCESSORY | oui | oui | oui | oui |
| Jan-fév. | 72014 | MATCH_UNIQUE | 72014 | Space | SMALL_SET | oui | oui | oui | oui |
| Jan-fév. | 72027 | MATCH_PRODUCT_UNIQUE | 72027v1…v12, un seul Product | thèmes propres aux 12 figurines | SINGLE_FIGURE | oui | oui | oui | oui |
| Jan-fév. | 72028 | MATCH_PRODUCT_UNIQUE | 72028v1…v12, un seul Product | thèmes propres aux 12 figurines | SINGLE_FIGURE | non | oui | oui | oui |
| Jan-fév. | 72043 | MATCH_UNIQUE | 72043 | Halloween | ACCESSORY | oui | oui | oui | oui |
| Mars | 71773 | MATCH_UNIQUE | 71773 | Junior | SMALL_SET | non | oui | oui | oui |
| Mars | 71774 | MATCH_UNIQUE | 71774 | Junior | SMALL_SET | non | non | oui | oui |
| Mars | 71775 | MATCH_UNIQUE | 71775 | Junior | SMALL_SET | non | non | oui | oui |
| Mars | 71903 | MATCH_UNIQUE | 71903 | Summer Fun | ACCESSORY | oui | oui | oui | oui |
| Mars | 71904 | MATCH_UNIQUE | 71904 | Summer Fun | PROMOTIONAL | oui | oui | oui | oui |
| Mars | 71905 | MATCH_UNIQUE | 71905 | Summer Fun | VEHICLE_SET | oui | oui | oui | oui |
| Mars | 72023 | MATCH_UNIQUE | 72023 | Magic | FIGURE_PACK | oui | oui | oui | oui |
| Mars | 72024 | MATCH_UNIQUE | 72024 | Pirates | FIGURE_PACK | oui | oui | oui | oui |
| Mars | 72031 | MATCH_UNIQUE | 72031 | City Life, City Service | SINGLE_FIGURE | oui | oui | oui | oui |
| Mars | 72034 | MATCH_UNIQUE | 72034 | Fairies | SINGLE_FIGURE | oui | oui | oui | oui |
| Soccer | 72056 | MATCH_UNIQUE | 72056 | Sports | SMALL_SET | oui | oui | oui | non |
| Soccer | 72057 | MATCH_UNIQUE | 72057 | Sports | SMALL_SET | oui | oui | oui | non |
| Soccer | 72058 | MATCH_UNIQUE | 72058 | Sports | SMALL_SET | oui | oui | oui | non |
| Knights | 72112 | MATCH_UNIQUE | 72112 | Knights | BUILDING_SET | oui | oui | oui | oui |
| Knights | 72113 | MATCH_UNIQUE | 72113 | Knights | BUILDING_SET | oui | oui | oui | oui |
| Knights | 72114 | MATCH_UNIQUE | 72114 | Knights | SMALL_SET | oui | oui | oui | oui |
| Knights | 72115 | MATCH_UNIQUE | 72115 | Knights | SMALL_SET | oui | oui | oui | oui |
| Knights | 72116 | MATCH_UNIQUE | 72116 | Knights | SMALL_SET | oui | non | oui | oui |
| Knights | 72117 | MATCH_UNIQUE | 72117 | Knights | ACCESSORY | oui | oui | oui | oui |
| Knights | 72118 | MATCH_UNIQUE | 72118 | Knights | SMALL_SET | oui | oui | oui | oui |
| Knights | 72119 | MATCH_UNIQUE | 72119 | Knights | SMALL_SET | oui | oui | oui | oui |
| Mai | 71873 | MATCH_UNIQUE | 71873 | Police | BUILDING_SET | oui | oui | oui | oui |
| Mai | 71874 | MATCH_UNIQUE | 71874 | Police | BUILDING_SET | oui | oui | oui | oui |
| Mai | 71875 | MATCH_UNIQUE | 71875 | Police | VEHICLE_SET | oui | oui | oui | oui |
| Mai | 72061 | MATCH_UNIQUE | 72061 | Racing | VEHICLE_SET | oui | oui | oui | oui |
| Mai | 72062 | MATCH_UNIQUE | 72062 | Racing | ACCESSORY | oui | oui | oui | oui |
| Mai | 72063 | MATCH_UNIQUE | 72063 | Racing | ACCESSORY | oui | oui | oui | oui |
| Mai | 72065 | MATCH_UNIQUE | 72065 | Racing | ACCESSORY | oui | oui | oui | oui |
| Mai | 72070 | MATCH_UNIQUE | 72070 | Zoo | ACCESSORY | oui | oui | oui | oui |
| Mai | 72071 | MATCH_UNIQUE | 72071 | Zoo | SMALL_SET | oui | oui | oui | oui |
| Mai | 72073 | MATCH_UNIQUE | 72073 | Zoo | ACCESSORY | oui | oui | oui | oui |

## Cas particuliers et stratégie Product/Variant

`72027` et `72028` sont les deux seuls `MATCH_PRODUCT_UNIQUE`. La base contient respectivement `72027v1` à `72027v12` et `72028v1` à `72028v12`, tous reliés à un seul produit logique par référence de base. La page officielle décrit la boîte/série, pas une figurine surprise précise.

Stratégie recommandée :

1. `ReleaseWaveItem` et `RangeMembership` ciblent `productId` pour une référence commerciale non suffixée publiée par une campagne officielle ;
2. la relation conserve `observedReference`, marché, URL, ordre observé et statut du matching ;
3. `variantId` reste optionnel et n'est utilisé que si la source désigne explicitement une édition ou un marché précis ;
4. la collection d'une gamme considère le produit possédé si au moins un de ses variants est possédé ; le détail peut ensuite montrer quels variants le sont ;
5. le catalogue individuel et ses 14 397 variants restent inchangés.

Cette règle donne 43 rattachements automatiques au niveau Product, sans fusion entre produits et sans choisir arbitrairement une des 24 figurines Series 29.

## Gammes explicitement attestées

| Gamme | Type proposé | Marché | Références attestées | Confiance | Preuve |
| --- | --- | --- | --- | --- | --- |
| Funstars | SERIES | US | 71634, 71720 | haute | section et catégorie Funstars explicites |
| ESA Space Range | LINE | US | 72011–72014 | haute | l'article emploie explicitement « ESA Space Range » |
| Magic Unicorns | SERIES | US | 71838, 71839, 71843 | haute | collection nommée et références groupées |
| PLAYMOBIL Figures Series 29 | SERIES | US | 72027, 72028 | haute | série et numéros Boys/Girls explicites |
| Monster High | LICENSE | US | 72043 | haute | section Monster High x PLAYMOBIL et catégorie officielle |
| My Life | LINE | US | 71903, 71904, 71905 | haute | l'article dit que ces produits font partie de My Life |
| PLAYMOBIL JUNIOR | LINE | US | 71773, 71774, 71775 | haute | références groupées sous le titre JUNIOR |
| Soccer | LINE | US | 72056, 72057, 72058 | haute | l'article emploie « PLAYMOBIL Soccer range » |
| Knights | LINE | US | 72112–72119 | haute | campagne et titre « new PLAYMOBIL Knights range » |
| Animals & Friends | LINE | US | 72070, 72071, 72073 | haute | « additions to the Animals & Friends range » |
| Offroad Cars | LINE | US | 72061, 72062, 72063, 72065 | haute | « all-new Offroad Cars range » |

Soit 11 `ProductRange` potentielles et 36 appartenances produit potentielles. Deux suggestions ont été rejetées :

- `Police` : l'article de mai atteste ici le thème `City Action`, pas une gamme durable Police distincte ;
- les quatre figurines diverses de mars : leur regroupement éditorial ne prouve pas une gamme commune.

## Données produit officielles disponibles

Couverture sur les 43 références, au moins sur un marché, puis détail FR/DE :

| Champ | Au moins un marché | FR | DE |
| --- | ---: | ---: | ---: |
| Nom officiel | 43 | 42 | 40 |
| Dimensions d'emballage | 43 | 42 | 40 |
| Poids | 42 | 41 | 39 |
| `figureCount` textuel | 41 | 32 | 38 |
| Image `box_front` | 40 | 39 | 37 |
| Image `box_back` | 41 | 40 | 38 |
| Image produit | 43 | 42 | 40 |

Les pages FR manquent pour `72012`; les pages DE manquent pour `72056`, `72057` et `72058`. Le média local de boîte manque encore pour `71774`, `71775` et `72116`.

Le parseur de personnages isole désormais strictement la section `Personnages/Figuren` avant `Animaux/Tiere` et `Accessoires/Zubehör`. Malgré cette correction, `figureCount` reste une observation à valider :

- `71903` : FR 3, DE 2 ;
- `71905` : FR 5, DE 4 ;
- `72034` : officiel 2, local 1 ;
- `72116` : officiel 2, local 1.

Ces différences peuvent refléter une définition différente des petits compagnons ou une divergence de contenu entre marchés. Elles doivent créer une revue/conflit, jamais une écriture canonique automatique.

## Conflits simulés

Le dry-run détecte 38 observations qui ne doivent pas être écrasées silencieusement :

- 34 différences entre nom FR officiel et traduction FR locale ;
- 2 divergences FR/DE de `figureCount` ;
- 2 divergences officiel/local de `figureCount`.

Une différence de nom n'est pas une erreur : le nom officiel FR doit devenir la source d'affichage prioritaire, tandis que le nom communautaire et le titre original restent conservés. Le nombre `38` représente donc des `SourceValue` contradictoires à traiter selon les règles de confiance, pas 38 produits incorrects.

## Dry-run d'import futur

```text
ReleaseWave
  wouldCreate: 5
  wouldUpdate: 0
  wouldReview: 0

ReleaseWaveItem (cible Product)
  officialReferences: 43
  MATCH_UNIQUE: 41
  MATCH_PRODUCT_UNIQUE: 2
  MATCH_MULTIPLE: 0
  BLOCKED_IDENTITY: 0
  MARKET_VARIANT_ONLY: 0
  ABSENT: 0
  wouldCreate: 43
  wouldReview: 0

ProductRange
  wouldCreate: 11
  insufficientEvidence/rejected: 2

RangeMembership (cible Product)
  wouldCreate: 36
  wouldReview: 0
  absent: 0

Official product enrichment observations
  namesFr: 42
  packageDimensions: 43
  figureCount: 41 (review required for conflicts)
  boxFront: 40
  boxBack: 41

Conflicts / reviews
  wouldCreate: 38
```

## Provenance minimale du prochain modèle

`ReleaseWave` : marché US, URL officielle, hash du document, `observedAt`, début/fin et précision (`MONTH`, `RANGE` ou `CAMPAIGN`).

`ReleaseWaveItem` : `productId`, référence observée, ordre de la référence dans la page, `sourceRecordId`, marché et statut de matching. Conserver séparément l'ordre du manifeste et l'ordre observé permet de détecter les changements éditoriaux sans modifier silencieusement les relations.

`ProductRange` : nom canonique, type simple (`LINE`, `SERIES`, `LICENSE`), source officielle qui nomme la gamme. Ne pas créer de gamme depuis le titre d'un produit.

`RangeMembership` : `productId`, `rangeId`, marché, `sourceRecordId`, URL et confiance. `variantId` est nullable et réservé aux preuves réellement spécifiques à une variante.

Clés d'idempotence recommandées :

- vague : marché + URL source + libellé/période ;
- élément de vague : vague + produit + référence observée ;
- gamme : slug canonique ;
- appartenance : gamme + produit + marché + sourceRecord.

Une transaction doit traiter une page source entière. Si son hash change, le dry-run doit afficher les références ajoutées, retirées ou réordonnées avant toute application.

## Idempotence

Le manifeste est constant et trié explicitement. Les candidats locaux sont ordonnés par identifiant/canonical key, les ensembles sont dédupliqués et les sorties ne contiennent le timestamp qu'en dehors du payload comparé. Deux constructions successives sur les mêmes lignes DB et les mêmes réponses officielles ont donné un hash identique. Les tests couvrent les six statuts de matching, l'ordre inversé des candidats, les pages incomplètes, les références parasites et la cible Product.

## Prochain chantier recommandé

Créer une migration petite et isolée avec `ProductRange`, `RangeMembership`, `ReleaseWave` et `ReleaseWaveItem`, toutes au niveau Product par défaut et avec provenance obligatoire. Charger uniquement ces 5 vagues et 11 gammes dans une transaction après un nouveau dry-run. Reporter `/gammes` et l'enrichissement des champs produit à un commit suivant afin de garder séparés : modèle, données sourcées et interface.

L'import des noms/dimensions/médias peut ensuite utiliser le même corpus, mais `figureCount` doit rester en REVIEW pour les quatre cas signalés. Aucun élargissement au-delà de ces 43 références ne doit être automatique à ce stade.
