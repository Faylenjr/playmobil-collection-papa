# Audit des identités déjà fusionnées

`pnpm identities:audit-merged` analyse uniquement les `ProductVariant` liés à
plusieurs `SourceRecord`. Cette commande est strictement en lecture seule et
refuse explicitement `--apply`.

## Méthode

Les preuves sont reconstruites par `SourceRecord` depuis ses propres
`SourceValue`, jamais depuis les champs sélectionnés du variant actuel. Le nom,
la référence, l'année, le thème et le format restent donc attribuables à leur
source. Le titre brut sert uniquement de fallback lorsqu'une ancienne fiche ne
possède pas la valeur structurée correspondante.

Chaque paire est classée `MATCH`, `DISTINCT` ou `AMBIGUOUS` avec
`compareIdentitySignals()`, complété par des signaux explicites conservateurs :
couleur, personnage de format Figures, ligne de transport, couverture et
contenu introduit par « with ». Une divergence forte sur au moins deux champs
de traduction partagés peut également établir `DISTINCT`, à condition que
toutes les traductions comparées divergent avec une faible proximité lexicale.
Une seule différence de nom ne suffit jamais. Une différence d'URL seule ne
prouve jamais que deux objets sont distincts.

Pour Klickypedia, le préfixe de l'URL `/sets/` est également comparé à la
référence déclarée par la page. Cette preuve est évaluée indépendamment de
l'identité : `EXACT`, `COMPATIBLE_BASE`, `STRONG_MISMATCH`, `WEAK` ou `NONE`.
Les suffixes de marché/famille absents du slug (`5793-USA`, `3600-FAM`,
`23.24.3-TROL`) et les suffixes numériques de page dupliquée sont compatibles.
Les placeholders (`N/A`, suites de zéros) restent faibles. Une différence de
version ou de numéro (`72306v12`/`72306v13`, `80316`/`80315`) est forte. La
référence déclarée et sa provenance ne sont jamais corrigées par ce diagnostic.

Les arêtes `MATCH` construisent des composantes connexes déterministes après
tri par `(source, externalId, id)`. Une composante n'est sûre que si toutes ses
paires sont `MATCH`. Une scission n'est prédite comme sûre que si toutes les
paires entre clusters sont `DISTINCT`; la moindre relation insuffisante laisse
le variant en `AMBIGUOUS`.

Le rapport expose deux jeux de compteurs orthogonaux :
`identityMatchGroups`, `identityDistinctGroups`, `identityAmbiguousGroups`,
puis `sourceConsistentGroups`, `sourceInconsistentGroups` et
`sourceUndeterminedGroups`. Chaque jeu totalise le nombre de variants audités.
Le champ `safeAction` vaut `KEEP_MERGED`, `SPLIT` ou `REVIEW`. Une incohérence
ou une preuve source indéterminée impose `REVIEW` sans effacer la classification
d'identité ; un groupe peut donc être à la fois `DISTINCT` et `INCONSISTENT`.

`variantsScanned` et `sourceRecordsScanned` portent uniquement sur les variants
multi-records audités. Le nombre global actuel de variants est exposé séparément
par `currentVariantCount` ;
`predictedVariantCountAfterSafeSplits` vaut ce total plus les seuls nouveaux
clusters issus des actions `SPLIT` sûres.

## Future phase d'application

Une future commande `--apply` devra consommer un plan d'audit versionné et
reconstruire chaque cluster depuis ses provenances, dans une transaction :

1. créer des `Product` et `ProductVariant` vides avec des clés déterministes ;
2. rattacher les `SourceRecord` du cluster ;
3. déplacer leurs `SourceValue.entityId` de type `ProductVariant` ;
4. recalculer les valeurs sélectionnées et les conflits uniquement depuis ces
   `SourceValue`, sans cloner les champs du variant contaminé ;
5. reconstruire références, traductions, thèmes, marchés et métadonnées ;
6. rattacher médias, notices, figurines et pièces seulement quand leur
   provenance au niveau `SourceRecord` est démontrable ;
7. reclassifier les conflits et ReviewTask devenus obsolètes en conservant leur
   historique et une `resolutionNote` ;
8. vérifier les invariants puis valider atomiquement la transaction.

Le schéma actuel ne porte pas toujours `sourceRecordId` sur les médias,
notices, relations de figurines et relations de pièces. Cette lacune doit être
comblée par une migration additive et par l'importeur avant toute scission
automatique. Pour les données historiques où l'attribution ne peut pas être
prouvée depuis le payload conservé, la future phase devra créer une revue
humaine plutôt que recopier une relation potentiellement contaminée.

Les fonctions pures `compareMergedRecordEvidence()` et
`clusterMergedSourceRecords()` constituent la primitive réutilisable pour
produire le plan. La future écriture devra utiliser une primitive distincte du
type `rebuildVariantFromSourceRecordCluster()` afin de ne jamais confondre
décision d'identité et mutation de données.
