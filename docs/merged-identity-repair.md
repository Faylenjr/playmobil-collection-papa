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
- l'absence de collision des clés canoniques déterministes.

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

## Relations historiques sans provenance

Le schéma historique ne relie pas `MediaAsset`, `Instruction`, `VariantFigure` ou `VariantPart`
à un `SourceRecord`. Les anciens payloads Klickypedia conservent seulement des compteurs, pas
les listes d'URL ou d'entités. Le job refuse donc d'inventer une attribution :

- un média ou une notice est déplaçable seulement si son `sourceId` n'apparaît que dans un seul
  cluster du groupe ;
- toute figurine, pièce, relation Product correspondante, collection ou wishlist ambiguë bloque
  le groupe concerné ;
- le dry-run conserve `DISTINCT / CONSISTENT / SPLIT`, mais ajoute par groupe
  `relationAttribution: COMPLETE | INCOMPLETE`,
  `applyEligibility: ELIGIBLE | BLOCKED_UNATTRIBUTED_RELATIONS` et les compteurs précis dans
  `unattributableRelations` ;
- les agrégats `identitySafeSplits`, `eligibleSplits`, `blockedSplits` et
  `eligibleNewVariants` séparent la validité sémantique de la possibilité matérielle de réparer ;
- `predictedVariantCountAfterApply` ne compte que les groupes éligibles.

Cette politique est volontairement non destructive : aucun asset n'est copié, supprimé ou
affecté arbitrairement. `--apply` ignore entièrement les groupes bloqués et applique seulement
les groupes éligibles dans une même transaction. Un échec d'un groupe éligible annule tous les
groupes éligibles de cette exécution. Les groupes bloqués restent strictement inchangés.

### Évolution recommandée des futurs imports

Une future migration additive devrait introduire `MediaAsset.sourceRecordId?` et
`Instruction.sourceRecordId?`, ainsi qu'une provenance équivalente (colonne ou table de lien)
pour `VariantFigure` et `VariantPart`. Les importeurs devront renseigner ces liens au moment de
l'ingestion. Aucun backfill historique ne doit inventer un `sourceRecordId` : les anciennes
lignes restent bloquantes tant qu'une provenance certaine n'a pas été collectée ou validée
humainement.

## Transaction

Tous les groupes éligibles sont appliqués dans une transaction unique avec un timeout de 120
secondes et un verrou `pg_advisory_xact_lock`. Une collision ou une erreur sur le dernier groupe
éligible annule les précédents. Aucune migration de schéma n'est requise par cette version
conservatrice.
