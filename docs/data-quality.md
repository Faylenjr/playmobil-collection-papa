# Qualité des données

## Définitions de comptage

- **entrée brute** : un `source_record` ;
- **identifiant observé** : graphie de référence publiée par une source ;
- **référence normalisée** : graphie nettoyée sans inférence risquée ;
- **produit de base** : concept regroupant des variantes démontrées ;
- **objet collectionnable** : variante effectivement distincte ;
- **doublon fusionné** : deux records reliés au même objet par une règle explicable.

Une URL de sitemap n'est pas automatiquement une référence et une référence commune n'est pas automatiquement un doublon.

## Résolution

La priorité est : officiel pertinent, base communautaire structurée, source éditoriale, marchand. La priorité ne transforme pas une affirmation en vérité ; tout désaccord reste visible. À priorité égale, la confiance puis la récence départagent la sélection automatique.

L'identité emploie une comparaison à trois issues : `MATCH`, `DISTINCT` ou `AMBIGUOUS`. Un nom identique ne suffit pas à fusionner : au moins une année ou un thème doit également concorder, sans contradiction. Une différence de nom seule ne suffit pas non plus à séparer. Les années, thèmes, familles d'objets, qualificatifs explicites et numéros de catalogue/magazine servent uniquement à reconnaître les cas distincts suffisamment étayés. Le doute produit `AMBIGUOUS` et une revue humaine.

La reclassification de la base existante est prévisualisable puis applicable :

```bash
pnpm identities:reclassify
pnpm identities:reclassify -- --apply
```

L'application est atomique et relançable. Les classifications de références et
les clôtures de revues attendues sont écrites par lots bornés, tandis que les
rekeys canoniques restent dans la même transaction. Une erreur (collision,
contrainte ou timeout) annule donc l'ensemble de la reclassification ; après
correction, la même commande `--apply` peut être relancée sans nettoyage manuel.

Elle ne fusionne et ne supprime aucun produit ou variant. Lorsqu'une référence est confirmée comme réutilisée, elle remplace atomiquement les anciennes clés dépendantes de l'ordre par des clés qualifiées déterministes. L'ancrage est le plus petit couple `(source, externalId)` parmi tous les `SourceRecord` représentant le variant ; plusieurs sources reconnues `MATCH` restent donc dédupliquées sur le même variant. Elle classe ensuite les références, résout avec une note les anciennes revues de placeholders/réutilisations attendues et ne conserve qu'une tâche active par groupe réellement ambigu.

Avant la première migration d'identité, ce préflight doit retourner zéro ligne :

```sql
SELECT sr.id, s.key AS source, sr.external_id,
       COUNT(DISTINCT sv.entity_id) AS product_variant_ids,
       ARRAY_AGG(DISTINCT sv.entity_id ORDER BY sv.entity_id) AS conflicting_variant_ids
FROM source_records sr
JOIN sources s ON s.id = sr.source_id
JOIN source_values sv ON sv.source_record_id = sr.id
WHERE sv.entity_type = 'ProductVariant'
GROUP BY sr.id, s.key, sr.external_id
HAVING COUNT(DISTINCT sv.entity_id) > 1;
```

La migration contient la même garde et s'interrompt intégralement si une incohérence est détectée ; elle ne choisit plus silencieusement le `SourceValue` le plus récent.

## Rapport

`src/report/coverage.ts` calcule la couverture depuis PostgreSQL. Un catalogue vide retourne 0 %, jamais une constante. Les métriques sont séparées entre produits et variantes afin de ne pas gonfler artificiellement les résultats.

Le rapport expose aussi les répartitions par source, année, décennie, taxonomie et classe d'identité. Il distingue les groupes de références réutilisées des groupes ambigus. `duplicatesMerged` reste présent pour compatibilité, mais correspond désormais uniquement aux `SourceRecord` supplémentaires explicitement liés à une variante déjà représentée ; ce n'est plus la soustraction trompeuse `sourceRecords - variants`.

## Seuil avant MVP

Le MVP ne devrait commencer qu'après : taux d'erreur d'extraction inférieur à 1 % sur le corpus de validation, références présentes à 100 %, absence de fusion silencieuse connue, provenance à 100 % et revue manuelle des règles de variantes.
