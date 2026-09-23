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

Elle ne fusionne, ne supprime et ne renomme aucun produit ou variant. Elle classe les références, résout avec une note les anciennes revues de placeholders/réutilisations attendues et laisse ouvertes les véritables ambiguïtés.

## Rapport

`src/report/coverage.ts` calcule la couverture depuis PostgreSQL. Un catalogue vide retourne 0 %, jamais une constante. Les métriques sont séparées entre produits et variantes afin de ne pas gonfler artificiellement les résultats.

Le rapport expose aussi les répartitions par source, année, décennie, taxonomie et classe d'identité. Il distingue les groupes de références réutilisées des groupes ambigus. `duplicatesMerged` reste présent pour compatibilité, mais correspond désormais uniquement aux `SourceRecord` supplémentaires explicitement liés à une variante déjà représentée ; ce n'est plus la soustraction trompeuse `sourceRecords - variants`.

## Seuil avant MVP

Le MVP ne devrait commencer qu'après : taux d'erreur d'extraction inférieur à 1 % sur le corpus de validation, références présentes à 100 %, absence de fusion silencieuse connue, provenance à 100 % et revue manuelle des règles de variantes.
