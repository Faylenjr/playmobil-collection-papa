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
contenu introduit par « with ». Une différence d'URL seule ne prouve jamais que
deux objets sont distincts.

Pour Klickypedia, le préfixe de l'URL `/sets/` est également comparé à la
référence déclarée par la page. Un désaccord crée la catégorie séparée
`SOURCE_INCONSISTENCY` et interdit toute décision automatique pour le groupe.

Les arêtes `MATCH` construisent des composantes connexes déterministes après
tri par `(source, externalId, id)`. Une composante n'est sûre que si toutes ses
paires sont `MATCH`. Une scission n'est prédite comme sûre que si toutes les
paires entre clusters sont `DISTINCT`; la moindre relation insuffisante laisse
le variant en `AMBIGUOUS`.

Les quatre compteurs `exactMatchGroups`, `distinctGroups`, `ambiguousGroups` et
`sourceInconsistencyGroups` classent les variants candidats et sont
mutuellement exclusifs. `variantsScanned` et `sourceRecordsScanned` portent
uniquement sur les variants multi-records audités. Le nombre global actuel de
variants est exposé séparément par `currentVariantCount` ;
`predictedVariantCountAfterSafeSplits` vaut ce total plus les seuls nouveaux
clusters issus des groupes `DISTINCT` sûrs.

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
