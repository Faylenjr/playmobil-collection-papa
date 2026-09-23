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

Un état partiellement appliqué est traité comme un drift. Un état complètement appliqué est
reconnu comme tel et rend une seconde exécution idempotente, sans création ni déplacement.

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
  l'apply ;
- le dry-run expose chaque blocage dans `relationAttributionBlockers` et positionne
  `applyBlocked: true`.

Cette politique est volontairement non destructive : aucun asset n'est copié, supprimé ou
affecté arbitrairement. Si le dry-run réel trouve des bloqueurs, il faut ajouter une provenance
explicite ou un mapping humain validé avant le split.

## Transaction

Les huit groupes sont appliqués dans une transaction unique avec un timeout de 120 secondes et
un verrou `pg_advisory_xact_lock`. Une collision ou une erreur sur le dernier groupe annule les
sept premiers. Aucune migration de schéma n'est requise par cette version conservatrice.
