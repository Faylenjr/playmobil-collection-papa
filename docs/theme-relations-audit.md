# Audit des relations de thèmes

Audit exécuté le 4 octobre 2026 sur la base réellement déployée (14 397 variantes). Aucune relation n'a été supprimée ou réécrite.

## Résultats

- 84 thèmes, tous au niveau racine (`parent_id` est nul) ;
- 14 399 relations `VariantTheme` et 13 183 relations `ProductTheme` ;
- les 14 397 variantes possèdent au moins un thème direct ;
- l'unique source de ces enregistrements est Klickypedia (14 466 `SourceRecord`) ;
- les 14 466 payloads sources contiennent une information de thème.

Les thèmes les plus présents sont `Merchandise` (1 366), `City Life` (1 100), `Knights` (839), `Western` (835), `Pirates` (642) et `Police` (633).

## Cause des rattachements incohérents

`VariantTheme` représente la catégorie de l'objet individuel importé. Pour les références à variantes, `ProductTheme` agrège les thèmes de tous les objets du produit logique. L'ancienne requête frontend faisait l'union des deux niveaux puis appliquait tous les thèmes produit à chaque variante.

Le cas le plus visible est celui des sachets Figures. Par exemple, le produit 5458 agrège 13 thèmes (Christmas, Construction, Egyptians, Pirates, Space, Western, etc.) parce que ses douze figurines appartiennent à des univers différents. Cette agrégation est correcte au niveau de la boîte, mais sa réapplication à chaque figurine est incorrecte. La base contenait ainsi 478 variantes rattachées à deux univers racine et plusieurs centaines rattachées à davantage, jusqu'à 13.

## Règle d'affichage appliquée

Pour une page ou un filtre portant sur une variante :

1. utiliser ses relations `VariantTheme` si elles existent ;
2. utiliser les relations `ProductTheme` uniquement en fallback si la variante ne possède aucun thème direct.

Cette règle corrige le catalogue sans mutation destructive. Les données sources restent intégralement consultables et les futures variantes sans thème direct conservent un fallback.

## Limites restantes

- la taxonomie Klickypedia est plate et mélange encore univers, gamme, licence, usage et catégories transversales ;
- `Merchandise`, `Figures Series` ou `Christmas` ne sont pas toujours des univers comparables à `City Life` ;
- le schéma ne stocke pas la provenance au niveau de chaque relation de thème ; la provenance est conservée dans le `SourceRecord`, mais pas directement attachée à `VariantTheme` ;
- aucune correction massive n'est justifiée tant qu'une source officielle structurée ne permet pas de distinguer `Theme`, `ProductRange`, licence et tag.

Le corpus officiel 2026 déjà audité fournit une base fiable pour de futurs `ProductRange` et `ReleaseWave`, mais il ne couvre que 43 références et ne justifie pas une réécriture générale des thèmes historiques.
