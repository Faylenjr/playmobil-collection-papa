# Réparation des variants historiquement fusionnés

`identities:repair-merged` matérialise uniquement les groupes `DISTINCT / CONSISTENT / SPLIT`
d'un rapport `identities:audit-merged` explicitement validé. La commande est en dry-run par
défaut et n'accepte aucune sélection implicite depuis l'état courant de la base.

```bash
pnpm identities:repair-merged -- \
  --plan reports/merged-identity-audit-v2.json \
  --expect-variants=8 \
  --expect-clusters=23 \
  --expect-new-variants=15 \
  --expect-current-variants=14382
```

L'écriture requiert en plus `--apply`. Les détails `KEEP_MERGED` et `REVIEW` présents dans le
plan sont toujours ignorés.

## Protection anti-drift

Le plan est validé structurellement puis condensé par SHA-256. Avant toute écriture, et une
seconde fois dans la transaction après acquisition d'un verrou advisory PostgreSQL, le job
vérifie :

- l'existence du variant et de tous ses `SourceRecord` ;
- `source`, `externalId`, `contentHash` et rattachement au variant attendu ;
- la couverture exacte et sans doublon des clusters ;
- le maintien de `DISTINCT / CONSISTENT / SPLIT` par l'algorithme courant ;
- le nombre global de variants attendu ;
- l'absence de collision des clés canoniques déterministes des ProductVariant **et** des
  Product, dans la base et entre tous les groupes du plan.

Le dry-run affiche `planHash`. Il est recommandé de le recopier dans l'apply avec
`--expect-plan-hash=<sha256>` afin de garantir que le fichier validé n'a pas été modifié entre
les deux commandes.

Chaque groupe possède son propre état `PENDING` ou `APPLIED`. Une relance reconnaît donc une
application partielle légitime (certains groupes éligibles déjà traités, d'autres bloqués) sans
la confondre avec un déplacement imprévu de `SourceRecord`. Un groupe partiellement déplacé
reste en revanche un drift bloquant. Une seconde exécution est idempotente.

## Reconstruction

Le cluster dont l'ancre `(source, externalId)` est lexicographiquement la plus petite conserve
le `ProductVariant.id` historique. Tous les clusters, y compris celui-ci, sont reconstruits
depuis leurs seuls `SourceRecord` et `SourceValue` :

- nouvelle résolution des champs et des valeurs sélectionnées ;
- remise à `NULL` des champs absents au lieu de conserver une valeur contaminée ;
- reconstruction des traductions, thèmes et marchés ;
- reconstruction des `ProductReference` en `REUSED` ;
- clés Product/Variant `ref:<référence>:record:<qualifier>` ;
- recalcul des conflits dans chaque cluster.

Les conflits `OPEN` de l'ancien variant passent à `AUTO_RESOLVED` avec la note
`resolved-by-merged-variant-split`. Si un conflit subsiste à l'intérieur d'un cluster, un
nouveau conflit portant uniquement les valeurs de ce cluster est créé. Aucun historique n'est
supprimé. Les `ReviewTask` ne sont ni supprimées ni modifiées et aucune revue n'est créée pour
un split validé.

La passe `identities:reclassify` reconnaît ensuite un groupe déjà validé lorsque toutes ses
références sont `REUSED` et que ses clés qualifiées correspondent exactement à ses ancres. Elle
reste donc idempotente même lorsque la distinction reposait sur les traductions multilingues.

### Plan Product

`Product.canonicalKey` reste volontairement plus générale que la clé du variant : la base de
référence est utilisée, puis le même qualificateur `:record:<stableQualifier>` que l'identité
du cluster. Deux objets `DISTINCT` portant la même référence obtiennent donc deux Product
qualifiés ; ils ne sont jamais regroupés sur le seul critère de la référence.

Le preflight construit le plan Product complet avant toute mutation :

- `KEEP` : le cluster conservant l'ID du variant peut reconstruire son Product historique
  uniquement si ce Product ne possède aucun autre variant ;
- `CREATE` : les autres clusters reçoivent un Product vide puis entièrement reconstruit depuis
  leur seule provenance ;
- lorsqu'un Product historique est partagé avec des variants extérieurs au split, il n'est
  jamais renommé ni reconstruit. Tous les clusters réparés en sont détachés vers des Product
  qualifiés créés séparément ;
- `REUSE` est réservé à la reconnaissance idempotente d'un cluster déjà matérialisé par ce
  plan. Un Product préexistant portant la bonne clé n'est pas réutilisé sans cette preuve.

Le JSON expose `productsToCreate`, `productsToKeep`, `productsToReuse`,
`sharedProductsPreserved`, le `productPlan` de chaque cluster et
`productCanonicalCollisions`. Une collision externe ou entre deux entrées du plan marque le
groupe `BLOCKED_PRODUCT_CANONICAL_COLLISION` avant toute écriture.

L'ancien apply créait correctement un nouveau Product pour le cluster conservant l'ancien
`ProductVariant.id` lorsque son parent était partagé, mais relisait ensuite le `productId`
historique avant le rebuild. Il tentait alors de renommer le parent partagé avec la clé déjà
créée, d'où une violation de `products_canonical_key_key`. Le nouvel apply transporte le
`resultingProductId` validé par le preflight et rattache explicitement le variant conservé à ce
Product avant reconstruction.

## Relations historiques sans provenance

Le schéma historique ne reliait pas `MediaAsset`, `Instruction`, `VariantFigure` ou `VariantPart`
à un `SourceRecord`. Le modèle additif `SourceMediaObservation` conserve désormais le fait
source « cette fiche a référencé cette URL et ce type de média », sans déclarer que le média
canonique appartient exclusivement à ce variant. Le job refuse toujours d'inventer une
attribution :

- un média réel est attribuable seulement si au moins un `SourceMediaObservation` appartenant
  aux `SourceRecord` du groupe prouve son URL ;
- plusieurs observations dans un même cluster produisent un seul asset canonique dans ce
  cluster ;
- si plusieurs clusters ont explicitement observé la même URL, chacun reçoit un asset. Cette
  duplication est prouvée et conserve les métadonnées historiques ;
- une notice reste déplaçable seulement si son `sourceId` n'apparaît que dans un seul cluster ;
- toute figurine, pièce, relation Product correspondante, collection ou wishlist ambiguë bloque
  le groupe concerné ;
- le dry-run conserve `DISTINCT / CONSISTENT / SPLIT`, mais ajoute par groupe
  `relationAttribution: COMPLETE | INCOMPLETE`,
  `applyEligibility: ELIGIBLE | BLOCKED_UNATTRIBUTED_RELATIONS | BLOCKED_PRODUCT_CANONICAL_COLLISION`
  et les compteurs précis dans
  `unattributableRelations` ;
- les agrégats `identitySafeSplits`, `eligibleSplits`, `blockedSplits` et
  `eligibleNewVariants` séparent la validité sémantique de la possibilité matérielle de réparer ;
- `predictedVariantCountAfterApply` ne compte que les groupes éligibles.

Cette politique est volontairement non destructive : aucun asset n'est copié, supprimé ou
affecté arbitrairement. `--apply` ignore entièrement les groupes bloqués et applique seulement
les groupes éligibles dans une même transaction. Un échec d'un groupe éligible annule tous les
groupes éligibles de cette exécution. Les groupes bloqués restent strictement inchangés.

Une exception vérifiée est classée `GENERIC_SOURCE_FALLBACK` :

```text
https://www.klickypedia.com/wp-content/uploads/2014/08/logo-klickypedia-click.jpg
```

Cette URL exacte est le fallback générique de Klickypedia, pas un média propre au variant. Elle
ne bloque donc pas un split et apparaît dans `genericMediaIgnored`, globalement et par groupe.
La ligne historique n'est ni copiée ni supprimée : elle reste sur le variant conservant l'ancien
ID. La reconnaissance est une égalité exacte ; aucun motif fondé sur `logo`, le domaine,
l'extension ou `/wp-content/` n'est utilisé. Le parser et le pipeline d'import empêchent sa
matérialisation lors des futurs imports, sans nettoyer les lignes historiques.

### Enrichissement ciblé de la provenance

```bash
pnpm media:enrich-source-provenance -- \
  --plan reports/merged-identity-audit-v2.json
```

La commande est en dry-run par défaut. Elle réexécute le preflight, sélectionne seulement les
groupes `SPLIT` encore `BLOCKED_UNATTRIBUTED_RELATIONS`, puis visite uniquement leurs
`SourceRecord` Klickypedia. Elle n'utilise ni sitemap ni découverte de liens. `--apply` insère
les observations prouvées avec `skipDuplicates`, sans modifier les variants, assets, conflits,
revues ou hashes historiques. Une URL actuelle absente des `MediaAsset` est signalée dans
`newMediaObserved`, mais n'est pas matérialisée comme asset canonique.

La provenance équivalente pour `Instruction`, `VariantFigure` et `VariantPart` reste une
évolution ultérieure. Aucun backfill ne devra inventer son origine.

## Transaction

Tous les groupes éligibles sont appliqués dans une transaction unique avec un timeout de 120
secondes et un verrou `pg_advisory_xact_lock`. Une collision ou une erreur sur le dernier groupe
éligible annule les précédents. La provenance média nécessite la migration additive
`20260923230000_source_media_observations` avant le prochain preflight.
