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

## Rapport

`src/report/coverage.ts` calcule la couverture depuis PostgreSQL. Un catalogue vide retourne 0 %, jamais une constante. Les métriques sont séparées entre produits et variantes afin de ne pas gonfler artificiellement les résultats.

## Seuil avant MVP

Le MVP ne devrait commencer qu'après : taux d'erreur d'extraction inférieur à 1 % sur le corpus de validation, références présentes à 100 %, absence de fusion silencieuse connue, provenance à 100 % et revue manuelle des règles de variantes.
