# Audit PlaymoDB, gammes et vagues de sortie

Audit réalisé le 25 septembre 2026. La base de production a uniquement été interrogée en lecture. Aucun import, aucune migration et aucune modification de donnée n'ont été effectués.

## Décision

Recommandation provisoire : **B — PlaymoDB paraît utile pour certaines données d'inventaire, pas comme source générale de gammes ou de vagues, et aucun import ne doit commencer sans accès autorisé à un export ou à une API.**

Le site expose les inventaires via des scripts CGI mais son `robots.txt` interdit `*.pl`, `/parts/*`, `/sets/*`, `/setthumbs/*` et `/backs/*`, avec un délai annoncé de 120 secondes. Un pilote automatisé de 50 à 100 fiches violerait donc les règles publiées. L'audit s'est arrêté après trois consultations contrôlées et ne transforme pas ces trois cas en taux de couverture.

## Couverture de départ dans notre base

| Mesure | Valeur |
|---|---:|
| Variantes | 14 397 |
| Variantes avec une référence `ASSIGNED` | 13 430 |
| Variantes avec une base numérique de 3 à 8 chiffres | 11 483 |
| Bases numériques distinctes | 9 581 |
| Bases uniques utilisables sans fusion locale | 8 888 |
| Bases réutilisées ou associées à plusieurs variantes | 693 |
| Identités `PLACEHOLDER` | 646 |
| Identités `REUSED` | 234 |
| Identités `AMBIGUOUS` | 87 |

`8 888` est un plafond de candidats locaux sûrs, pas un nombre de matchs PlaymoDB. Le taux de match réel reste **non mesuré** tant qu'un mode d'accès autorisé n'est pas disponible.

### Classes prioritaires

| Classe | Total | Base numérique | Base locale unique |
|---|---:|---:|---:|
| `SMALL_SET` | 3 413 | 2 939 | 2 209 |
| `UNKNOWN` | 1 533 | 454 | 367 |
| Ensemble | 4 946 | 3 393 | 2 576 |

Au maximum, 2 576 objets prioritaires sont donc éligibles à un rapprochement automatique conservateur. Ce chiffre ne dit pas lesquels existent réellement dans PlaymoDB, ni si leur inventaire est complet. La différence avec les 1 296 `UNKNOWN` initialement repérés vient du garde-fou : seuls 454 possèdent une référence numérique `ASSIGNED`; les placeholders et identités réutilisées/ambiguës ne sont pas des candidats.

## Ce que PlaymoDB contient réellement

PlaymoDB se présente comme une base communautaire non officielle orientée vers les relations **set → pièces**, **pièce → sets** et les « Klickies ». Elle propose aussi un thème, un `Focus`, une première date de sortie, des notes, des instructions miniatures et un inventaire quand il est connu.

La FAQ indique une couverture principalement allemande depuis 1974, complétée par des références nord-américaines plus récentes. Elle signale également que les inventaires viennent de notices, de photos et de contributions humaines. La wishlist du site mentionne explicitement des inventaires à vérifier ou incomplets. PlaymoDB ne peut donc pas être traité comme une vérité canonique silencieuse.

### Trois sondages contrôlés

| Référence | Résultat observé | Enseignement |
|---|---|---|
| `7102` | trouvé ; thème `Color`, focus `Klickies`, inventaire annoncé très incomplet ; note sur `7102x` | une même base peut avoir des éditions ou sens distincts ; ne jamais fusionner par base seule |
| `70568` | trouvé ; thème `Police`, focus `Combination`, 90 lignes/types de pièces inventoriés, 3 éléments de catégorie Klicky, date 2021-01-31 | inventaire prometteur, mais « types distincts » n'est pas automatiquement le nombre total de pièces |
| `71792` | absent au moment du contrôle | les sorties récentes ou certains marchés ne sont pas garantis |

Trois cas ne permettent aucun pourcentage statistique. Ils suffisent seulement à confirmer la structure, l'intérêt possible et les risques.

## Champs exploitables et règles de confiance

| Donnée PlaymoDB | Usage proposé | Confiance / condition |
|---|---|---|
| Numéro de set | clé de lookup seulement | exact, numérique, identité locale `ASSIGNED`, base utilisée par une seule variante |
| Inventaire de pièces | observation de source | conserver chaque ligne et son URL ; ne déclarer complet que si PlaymoDB le dit explicitement |
| `pieceCount` | somme des quantités | uniquement inventaire complet ; ne pas utiliser le nombre de types distincts |
| Klickies / figurines | observation et relation | compter seulement les quantités explicites ; garder la définition PlaymoDB distincte de notre notion de figurine |
| `figureCount` | valeur candidate | seulement si l'inventaire est complet et la taxonomie compatible ; sinon REVIEW |
| Theme | comparaison / proposition | ne pas écraser le thème existant ; taxonomie communautaire différente |
| Focus | signal de classification secondaire | utile pour `Building`, `Vehicle`, `Klickies`, etc., mais pas preuve suffisante seul |
| Première sortie | observation datée | ne pas écraser une date officielle ou marché-spécifique |
| Noms et images | pas de copie automatique | droits et consignes du site à respecter |

## Matching conservateur

Le helper `decidePlaymoDbMatch()` impose les règles suivantes :

1. identité locale `ASSIGNED` uniquement ;
2. `baseValue` strictement numérique, 3 à 8 chiffres, jamais tout-zéro ;
3. une seule variante locale utilisant cette base ;
4. zéro résultat source = `ABSENT` ;
5. un résultat = candidat unique rattaché à **la variante existante**, y compris une variante marché ;
6. plusieurs résultats ou base réutilisée = `REVIEW`, jamais fusion automatique.

Le script `pnpm audit:playmodb-candidates` produit les statistiques et un manifeste déterministe de 80 références couvrant cinq époques et quatre classes (`SMALL_SET`, `UNKNOWN`, `BUILDING_SET`, `VEHICLE_SET`). Il n'effectue aucune requête réseau et aucune écriture DB.

## Impact potentiel sur la classification

Les 4 946 `SMALL_SET + UNKNOWN` sont la cible utile. Le gain réel dépend de deux conditions non encore mesurées : présence de la référence dans PlaymoDB et complétude de son inventaire.

- un `pieceCount` complet peut promouvoir honnêtement un set vers `MAIN_SET` ;
- un focus ou un inventaire cohérent peut fournir un signal pour bâtiment/véhicule, mais ne doit pas suffire seul ;
- les inventaires peuvent distinguer figurines, animaux et accessoires ;
- les marchandises actuellement `UNKNOWN` ne gagneront probablement rien de PlaymoDB, qui se concentre sur les jouets et exclut des spécialités.

Il est donc impossible d'annoncer aujourd'hui « X objets reclassés ». Toute projection chiffrée avant le pilote autorisé serait inventée.

## Thème, gamme et vague : trois entités différentes

### Thème / univers

Taxonomie large et durable : `City Action`, `City Life`, `Western`, `Pirates`, `Knights`. Le modèle `Theme` actuel, hiérarchique, reste adapté. Une catégorie marchande officielle peut être une observation de thème, sans devenir automatiquement canonique sur tous les marchés.

### Gamme / série

Identité commerciale nommée et réutilisable sur plusieurs années : `Novelmore`, `Wiltopia`, `Horses of Waterfall`, `Monster High`, `Figures Series 29`, `ESA Space Range`. Elle doit être attestée par une page officielle, un catalogue ou une taxonomie structurée. Un mot commun dans deux titres n'est jamais une gamme.

Les pages officielles montrent que la taxonomie n'est pas un arbre simple : `Horses of Waterfall` apparaît dans un univers marchand `I LOVE HORSES`, tandis que des pages promotionnelles mêlent `Country`, `I LOVE HORSES`, extensions et offres. Une variante peut donc appartenir à plusieurs gammes ou axes éditoriaux selon le marché.

### Vague de sortie

Campagne ou fenêtre de lancement explicitement attestée. Les articles officiels « January & February 2026 releases » et « March 2026 releases » constituent des preuves valables de vagues et listent des groupes/références. Une année commune, un tri « plus récent » ou une présence simultanée dans le shop n'en constituent pas une.

## Modèle recommandé avant migration

Ne pas détourner `Theme`. Ajouter plus tard, après pilote, des entités indépendantes :

### `ProductRange`

- `id`, `canonicalName`, `slug`, `parentRangeId?` ;
- `kind` (`LINE`, `SERIES`, `LICENSE`, `SUBLINE`) ;
- `startDate?`, `endDate?` ;
- noms localisés séparés ;
- aucune déduction depuis le titre.

### `RangeMembership`

- `rangeId` ;
- `productId?` ou `variantId?` avec contrainte XOR ;
- `marketId?` ;
- `sourceRecordId`, URL, valeur observée, `observedAt` ;
- `confidence` et `status` (`CONFIRMED`, `REVIEW`, `REJECTED`) ;
- période de validité éventuelle.

Une appartenance au produit convient à une gamme mondiale stable ; la variante est nécessaire pour une édition ou un marché précis.

### `ReleaseWave`

- `id`, `label`, `marketId` ;
- `startDate?`, `endDate?`, précision (`DAY`, `MONTH`, `SEASON`, `RANGE`) ;
- `sourceRecordId` obligatoire ;
- `evidenceKind` (`OFFICIAL_RELEASE_PAGE`, `OFFICIAL_CATALOG`, `OFFICIAL_CAMPAIGN`) ;
- `rangeId?`, sans obligation : une vague peut contenir plusieurs gammes.

### `ReleaseWaveItem`

- `releaseWaveId` ;
- `productId?` ou `variantId?` ;
- provenance, statut et confiance identiques aux memberships.

Le socle `Source` / `SourceRecord` / `SourceValue` / `Conflict` existant suffit pour conserver les observations et contradictions. Il ne suffit pas à représenter proprement les appartenances plusieurs-à-plusieurs : les tables métier restent nécessaires.

## Provenance PlaymoDB

Si un accès autorisé est obtenu, créer une `Source` dédiée `playmodb`, enregistrer le document brut ou son empreinte dans `SourceRecord`, puis conserver pour chaque valeur : URL, valeur observée, date d'observation et règle de canonicalisation. Une contradiction avec Klickypedia ou Playmobil officiel reste visible dans `SourceValue`/`Conflict`; aucune valeur n'est écrasée silencieusement.

Les dizaines de milliers de pièces ne doivent pas être importées comme catalogue autonome. Le premier pipeline doit se limiter aux sets du manifeste, à leurs totaux fiables et, seulement si utile, aux relations nécessaires au calcul.

## UX future `/gammes`

La page liste des cartes de gamme avec image sourcée, nom, période, total, possédés, wishlist et manquants. La fiche `/gammes/[slug]` affiche les variantes membres, les vagues attestées, les compteurs et un tri référence/date.

Les compteurs restent calculés à la lecture :

- `total` = membres confirmés visibles ;
- `possédés` = membres joints à la collection ;
- `recherchés` = membres joints à la wishlist ;
- `manquants` = total moins possédés (la wishlist reste un sous-ensemble signalé, pas une soustraction supplémentaire) ;
- complétion = possédés / total.

`/catalogue` conserve les 14 397 variantes. `/nouveautes` reste chronologique tant qu'une vague n'est pas appuyée par une preuve officielle ; une vue par vagues pourra être ajoutée en option, jamais reconstruite par année seule.

## Plan d'import conditionnel

1. demander à PlaymoDB un export ou une autorisation/API adaptée et clarifier les droits de réutilisation ;
2. exécuter le manifeste de 80 références en lecture, sans média ;
3. mesurer trouvés, absents, résultats multiples, inventaires complets, contradictions et dates ;
4. faire valider manuellement au moins tous les matchs ambigus et 20 matchs uniques ;
5. calculer en dry-run les changements de `pieceCount`, `figureCount` et classification ;
6. n'écrire qu'après seuils convenus, avec `SourceRecord` et conflits ;
7. lancer d'abord un lot de 50 à 100, ré-auditer, puis seulement envisager une couverture plus large.

Seuil recommandé : 100 % des écritures avec provenance, 0 fusion ambiguë, au moins 98 % de précision sur les matchs uniques contrôlés, et indicateur de complétude obligatoire pour dériver les totaux.

## Sources consultées

- PlaymoDB accueil : <https://www.playmodb.org/playmodb.shtml>
- PlaymoDB FAQ : <https://www.playmodb.org/playmodb_faq.html>
- PlaymoDB robots : <https://www.playmodb.org/robots.txt>
- PlaymoDB wishlist : <https://playmodb.org/wishlist.php>
- PLAYMOBIL City Action FR : <https://www.playmobil.com/fr-fr/web-shop/city-action/>
- PLAYMOBIL Novelmore FR : <https://www.playmobil.com/fr-fr/content/novelmore_themepage/novelmore_themepage.html>
- PLAYMOBIL Wiltopia FR : <https://www.playmobil.com/fr-fr/content/wiltopia_themepage/wiltopia_themepage.html>
- PLAYMOBIL janvier-février 2026 : <https://www.playmobil.com/en-us/blog/january-and-february-2026-releases.html>
- PLAYMOBIL mars 2026 : <https://www.playmobil.com/en-us/blog/2026-march-releases.html>
