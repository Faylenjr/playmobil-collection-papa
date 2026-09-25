# Audit des sources officielles PLAYMOBIL, gammes et vagues

Audit réalisé le 25 septembre 2026. Il est volontairement en lecture seule : aucune donnée catalogue, collection, wishlist, REVIEW ou base de production n'a été modifiée. Aucun import officiel n'a été exécuté.

## Décision

**Arrêt après l'audit et le pilote.** Les sources officielles méritent une intégration ciblée, mais pas encore un import large des 2 576 candidats `SMALL_SET + UNKNOWN`.

Le pilote retrouve une page officielle pour 22 références sur 92 (23,91 %), presque exclusivement dans les années 2010–2020. Il ne trouve aucun `pieceCount` numérique. En revanche, 21 des 22 pages retrouvées donnent les dimensions d'emballage et le poids, et les pages éditoriales 2026 fournissent plusieurs vraies vagues de sortie explicitement sourcées. Ces deux usages doivent être traités séparément :

1. enrichissement ciblé des produits actuels avec dimensions, poids, noms et médias officiels ;
2. création de vagues uniquement depuis des pages officielles qui regroupent explicitement leurs références.

Une page boutique ou une année commune ne suffit pas pour créer une gamme ou une vague.

## Méthode et garde-fous

- Sources interrogées : pages produit publiques FR et DE, sitemaps officiels et pages éditoriales officielles US/FR/DE.
- `robots.txt` a été consulté avant toute requête. Les pages produit HTML et les sitemaps sont autorisés ; aucun chemin interdit n'a été contourné.
- Pilote déterministe et stratifié sur les candidats locaux uniques : identité `ASSIGNED`, base numérique de 3 à 8 chiffres, base utilisée par un seul variant.
- Échantillon demandé : 80 à 120. Échantillon obtenu : 92, soit toutes les lignes produites par les strates disponibles avec un maximum de trois objets par strate.
- Deux marchés testés par référence : FR puis DE, avec délai minimal de 1 500 ms et une seule nouvelle tentative.
- La référence lue dans la page officielle doit être identique à la base demandée. Une redirection ou une page portant une autre référence est rejetée.
- Aucune valeur n'est écrite. Les résultats sont des observations de source, pas des valeurs canoniques.

## Couverture des sources officielles

Les sitemaps observés contenaient 327 pages produit FR et 546 pages produit DE. Cette photographie représente le catalogue ou les archives actuellement exposés, pas une preuve de couverture historique exhaustive.

Sources officielles principales consultées :

- règles et sitemaps : <https://www.playmobil.com/robots.txt> ;
- exemple de fiche actuelle : <https://www.playmobil.com/de-de/72168.html> ;
- gamme Novelmore FR : <https://www.playmobil.com/fr-fr/content/novelmore/novelmore.html> ;
- gamme Wiltopia FR : <https://www.playmobil.com/fr-fr/content/wiltopia/wiltopia.html> ;
- univers City Action FR : <https://www.playmobil.com/fr-fr/shop-online/shop-themes/city-action/> ;
- vitrine nouveautés 2025 FR : <https://www.playmobil.com/fr-fr/novelty-2025/novelty-2025.html>.

| Donnée | FR | DE | Pages éditoriales US | Couverture pilote, au moins un marché | Fiabilité observée |
| --- | ---: | ---: | ---: | ---: | --- |
| Page produit retrouvée | 4/92 | 22/92 | n/a | 22/92 (23,91 %) | élevée après contrôle de référence |
| Nom produit exploitable | 4/92 | 20/92 | parfois | 20/92 (21,74 %) | élevée ; deux archives DE n'exposent que la référence |
| `pieceCount` numérique | 0/92 | 0/92 | non observé | 0/92 | absent, ne pas déduire depuis le texte |
| Nombre de figurines | 2/92 | 10/92 | non observé | 10/92 (10,87 %) | moyenne ; inventaire textuel à valider |
| Dimensions de l'emballage | 4/92 | 21/92 | non observé | 21/92 (22,83 %) | élevée ; 95,45 % des pages retrouvées |
| Dimensions du produit | 1/92 | 2/92 | non observé | 2/92 (2,17 %) | élevée mais rare |
| Poids | 4/92 | 21/92 | non observé | 21/92 (22,83 %) | élevée |
| Année explicite ou archive datée | 0/92 | 14/92 | oui | 14/92 (15,22 %) | moyenne ; l'archive atteste une année de contexte, pas toujours une date commerciale précise |
| Image produit principale | 4/92 | 19/92 | oui | 19/92 (20,65 %) | élevée pour le type de fichier |
| Face avant de boîte | 3/92 | 15/92 | parfois | 15/92 (16,30 %) | élevée pour le type de fichier |
| Dos de boîte | 3/92 | 15/92 | parfois | 15/92 (16,30 %) | élevée pour le type de fichier |
| Thème / univers | fil d'Ariane variable | fil d'Ariane variable | regroupements éditoriaux | non mesurable proprement | faible à moyenne ; l'archive annuelle domine souvent le fil d'Ariane |
| Gamme | pages catégories et campagnes | pages catégories et campagnes | groupes nommés | non mesurable proprement | moyenne si le regroupement est explicitement nommé |
| Vague de sortie | peu d'exemples actuels | peu d'exemples actuels | plusieurs pages 2026 explicites | hors pilote produit | élevée seulement lorsque la page liste explicitement les références |

Les fiches produit officielles distinguent `Dimensions de l'emballage` / `Packungsmaße` et dimensions du produit. Le schéma local ne doit donc pas réutiliser aveuglément `widthMm`, `heightMm` et `depthMm`, dont la sémantique actuelle n'est pas assez explicite.

## Profil et résultats du pilote

| Mesure | Résultat |
| --- | ---: |
| Taille | 92 |
| `SMALL_SET` | 58 |
| `UNKNOWN` | 34 |
| Variants de marché | 47 |
| `figureCount` local déjà connu | 40 |
| Sans média local | 0 |
| Match officiel FR ou DE | 22 (23,91 %) |
| Match FR | 4 (4,35 %) |
| Match DE | 22 (23,91 %) |
| Match sur les deux marchés | 4 (4,35 %) |
| Match `SMALL_SET` | 12 |
| Match `UNKNOWN` | 10 |
| Match années 2010 | 11 |
| Match années 2020 | 11 |
| Match avant 2010 | 0 |

Parmi les dix observations de figurines, six complètent un `figureCount` local nul. Aucune contradiction n'a été observée lorsque deux valeurs comparables existaient, mais le comptage est extrait d'un inventaire textuel (`Personnages`/`Figuren`) : il faut conserver la valeur observée et sa provenance, et valider les formulations atypiques avant canonicalisation.

Exemples contrôlés :

| Référence | Classe actuelle | Observation officielle |
| --- | --- | --- |
| 71701 | `SMALL_SET` | nom FR, emballage 248 × 187 × 72 mm, produit 377 × 197 × 260 mm, 250 g, inventaire de 4 personnages |
| 72087 | `SMALL_SET` | nom FR, emballage 248 × 142 × 70 mm, 227 g ; inventaire textuel à revoir avant de retenir le total de personnages |
| 9396-ger | `SMALL_SET` | emballage 515 × 284 × 124 mm, 1 132 g : signal fort que la classe actuelle sous-estime ce camion |
| 70846-fra | `UNKNOWN` | emballage 486 × 430 × 126 mm, 2 696 g ; grosse boîte événementielle/bundle, pas nécessairement un set principal ordinaire |

## Impact possible sur la classification

Le pilote ne débloque pas `MAIN_SET` avec la règle actuelle : `pieceCount` reste à 0 %. Aucun total ne doit être reconstruit en additionnant naïvement le texte d'inventaire.

Le volume d'emballage est néanmoins un signal structuré et beaucoup plus utile que les mots `Large`, `Mega` ou `box`. Les volumes observés vont d'environ 368 cm³ à 26 331 cm³. Ils séparent clairement certaines petites et grosses boîtes, mais ne distinguent pas à eux seuls un set principal d'un bundle, d'une boîte événementielle ou d'un article promotionnel.

Règle proposée pour un futur calibrage, non activée :

1. exiger un `product.kind = SET` ou une catégorie officielle équivalente ;
2. utiliser le volume d'emballage comme signal de taille, jamais comme type produit ;
3. combiner, lorsqu'ils existent, volume, poids, `figureCount`, `pieceCount` et relations d'inventaire ;
4. calibrer les seuils sur un échantillon labellisé et sur les catégories officielles XS/S/M/L/XL ;
5. conserver `UNKNOWN` pour les bundles, promotions et observations insuffisantes.

Une classe `MEDIUM_SET` ne doit être ajoutée qu'après cette calibration. Les résultats présents ne justifient ni des seuils définitifs ni un recalcul global.

## Theme, ProductRange et ReleaseWave

### Theme

Univers large et relativement stable (`City Action`, `City Life`, `Pirates`, `Western`). Il reste distinct des catégories marchandes temporaires.

### ProductRange

Ligne ou série officiellement nommée et durable (`Novelmore`, `Wiltopia`, `Horses of Waterfall`, `My Figures`, `Astérix`, `Monster High`). Une appartenance n'est créée que si une page officielle, une donnée structurée ou une campagne relie explicitement la référence à la gamme. Un mot commun dans les titres ne constitue pas une preuve.

### ReleaseWave

Lancement ou campagne bornée qui liste explicitement ses produits. La même gamme peut avoir plusieurs vagues ; un produit peut apparaître dans plusieurs marchés ou contextes éditoriaux. Une année identique ne constitue jamais une vague.

## Vagues officielles confirmées

Les pages éditoriales US 2026 donnent des exemples directement exploitables comme preuves de vague :

| Vague officielle | Références explicitement listées |
| --- | --- |
| January and February 2026 releases | 71634, 71720, 71838, 71839, 71843, 72011, 72012, 72013, 72014, 72027, 72028, 72043 |
| March 2026 releases | 71773, 71774, 71775, 71903, 71904, 71905, 72023, 72024, 72031, 72034 |
| New Soccer Playsets for 2026 | 72056, 72057, 72058 |
| PLAYMOBIL Knights 2026 new releases | 72112, 72113, 72114, 72115, 72116, 72117, 72118, 72119 |
| May 2026 releases | 71873, 71874, 71875, 72061, 72062, 72063, 72065, 72070, 72071, 72073 |

Pages sources :

- <https://www.playmobil.com/en-us/blog/january-and-february-2026-releases.html>
- <https://www.playmobil.com/en-us/blog/2026-march-releases.html>
- <https://www.playmobil.com/en-us/blog/new-soccer-playsets-for-2026.html>
- <https://www.playmobil.com/en-us/blog/playmobil-knights-2026-new-releases.html>
- <https://www.playmobil.com/en-us/blog/may-2026-releases.html>

Ces pages donnent un titre, une période ou campagne, un marché et des références explicitement regroupées. Elles satisfont donc le seuil de preuve proposé. À l'inverse, les pages FR/DE « nouveautés 2025 » sont des vitrines annuelles évolutives : elles prouvent un contexte de campagne, pas automatiquement une vague mensuelle figée.

## Modèle de données proposé

Le modèle existant `Source` → `SourceRecord` → `SourceValue`/`Conflict` reste adapté aux valeurs scalaires. Les appartenances gamme/vague nécessitent des relations dédiées afin de ne pas les aplatir dans `Theme`.

### Tables

`ProductRange`

- `id`, `canonicalName`, `slug`
- `kind` : `LINE`, `SERIES`, `LICENSE`, `SUBLINE`
- `parentRangeId?` pour les sous-lignes réelles
- `startYear?`, `endYear?`, `status?`

`ProductRangeTranslation`

- `rangeId`, `locale`, `name`, `description?`
- provenance via `sourceRecordId` ou observation dédiée
- unicité par gamme, locale et source

`ProductRangeTheme`

- relation M:N entre gamme et thème
- `marketId?`, `sourceRecordId`, `confidence`, `validFrom?`, `validTo?`

`VariantRangeMembership`

- `variantId`, `rangeId`, `marketId?`, `role?`
- `sourceRecordId`, `sourceUrl`, `observedAt`, `confidence`, `status`
- clé idempotente sur variant, gamme, marché et source

`ReleaseWave`

- `id`, `canonicalName`, `slug`, `marketId`
- `releaseStart?`, `releaseEnd?`, `releaseYear`
- `precision` : `DAY`, `MONTH`, `PERIOD`, `SEASON`, `CAMPAIGN`
- `sourceRecordId`, `sourceUrl`, `observedAt`
- `rangeId?` seulement si la source relie réellement toute la vague à cette gamme

`ReleaseWaveVariant`

- `releaseWaveId`, `variantId`
- `sourceRecordId`, ordre observé éventuel
- clé idempotente sur vague, variant et source

Champs physiques explicites sur le variant ou dans une table d'observations canoniques :

- `packageWidthMm`, `packageHeightMm`, `packageDepthMm`, `packageWeightGrams`
- conserver séparément les dimensions du produit déjà représentées par `widthMm`, `heightMm`, `depthMm`
- unité normalisée en millimètres/grammes, valeur source brute conservée dans `SourceValue`

Les relations M:N permettent à un variant d'appartenir à une gamme durable et à plusieurs vagues/marchés sans écraser son thème. Chaque écriture future doit être transactionnelle par page source, idempotente, et annulée entièrement si une référence devient ambiguë.

## Provenance, conflits et médias

- Créer des sources distinctes `playmobil-fr`, `playmobil-de`, `playmobil-us` avec marché et priorité explicites.
- Conserver l'HTML brut ou le payload pertinent dans `SourceRecord`, son hash, l'URL et les dates de contrôle.
- Enregistrer les noms officiels FR comme observation `name.fr`, prioritaire pour l'affichage mais sans supprimer la traduction Klickypedia ni le titre original.
- Une divergence numérique crée un conflit ; l'absence d'une valeur sur un marché n'est pas une contradiction.
- Pour les médias, conserver l'URL officielle, le type observé (`box_front`, `box_back`, `main`), le propriétaire et la page source.
- Ne pas télécharger ni rehéberger : `canRehost = false`. L'affichage par URL distante (`canDisplay`) doit rester désactivé ou en attente tant que les conditions d'utilisation n'ont pas été validées explicitement.

## Expérience `/gammes` proposée

La mise en œuvre frontend est différée jusqu'à l'existence de données sourcées suffisantes.

`/gammes` présentera des cartes avec nom FR, image représentative autorisée, période, nombre de références et statistiques :

- `possédés` : variants de la gamme présents dans la collection ;
- `recherchés` : variants présents dans la wishlist ;
- `manquants` : total de la gamme moins l'union collection/wishlist ;
- `complétion` : possédés / total, avec déduplication par variant.

`/gammes/[slug]` affichera la description sourcée, les thèmes parents, les références individuelles et, séparément, les vagues confirmées. Le catalogue actuel reste inchangé.

`/nouveautes` ne basculera vers une vue par vagues que lorsque la couverture sera suffisante. Dans l'intervalle, son ordre chronologique individuel reste la vérité principale ; les quelques vagues confirmées peuvent être ajoutées plus tard comme encarts complémentaires.

## Plan de suite recommandé

1. Constituer un petit jeu de vérité manuellement labellisé sur les produits officiels courants : type réel, taille de boîte officielle XS/S/M/L/XL, bundle/promotion, gamme.
2. Étendre le parseur seulement aux pages présentes dans les sitemaps et aux pages éditoriales explicitement autorisées ; ne pas deviner d'URL historique.
3. Faire un dry-run séparé sur les références 2026 des cinq vagues confirmées : matches uniques, variants absents, marchés, conflits, gammes et médias.
4. Valider juridiquement/contractuellement `canDisplay` avant toute utilisation d'image distante.
5. Implémenter ensuite la migration Range/Wave et les dimensions d'emballage avec tests d'idempotence, conflits et rollback.
6. Rejouer le pilote en dry-run, publier les créations/mises à jour/conflits prévues, puis seulement demander validation pour une écriture.

## Conclusion

Recommandation : **intégration partielle et ciblée**, pas d'import large. Les sources officielles sont excellentes pour authentifier les produits actuels, récupérer dimensions/poids/noms/médias et documenter certaines vagues récentes. Elles ne donnent pas, dans ce pilote, le `pieceCount` attendu et ne couvrent pas suffisamment l'historique pour enrichir automatiquement les 2 576 candidats sûrs. Le modèle Range/Wave est prêt conceptuellement, mais sa migration et son frontend seraient prématurés sans un premier corpus officiel explicite et reproductible.
