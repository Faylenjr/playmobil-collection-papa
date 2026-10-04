# Audit des références orienté collectionneur

Audit réalisé sur la base homelab le 4 octobre 2026, avant modification. Le script reproductible est `scripts/audit-collector-references.ts`.

## Distribution réelle

- 14 397 variantes et 14 397 références principales ;
- identité : 13 430 `ASSIGNED`, 646 `PLACEHOLDER`, 234 `REUSED`, 87 `AMBIGUOUS` ;
- forme : 7 056 numériques, 4 061 numériques avec suffixe, 2 902 alphanumériques et 378 avec une autre ponctuation ;
- numériques purs : 4 267 de longueur 4, 2 333 de longueur 5, mais aussi 455 références de 6 chiffres ou plus et quelques cas plus courts.

Après application de la règle collectionneur :

| Groupe | Nombre | Position dans le tri |
| --- | ---: | --- |
| référence commerciale normale | 8 967 | en premier, base numérique croissante |
| référence spéciale exploitable | 4 697 | après les références commerciales |
| placeholder, ambiguë ou non assignée | 733 | tout à la fin |

Les références commerciales retenues couvrent 43 bases à 3 chiffres, 6 498 à 4 chiffres et 2 426 à 5 chiffres. La règle n'est donc pas « exactement cinq chiffres ».

## Définition d'une collector reference

Une référence commerciale normale doit :

1. avoir une identité `ASSIGNED` ou `REUSED` ;
2. disposer d'une `baseValue` numérique historique de 3 ou 4 chiffres, ou d'une référence moderne comprise entre `70000` et `72999`, et ne pas être entièrement nulle ;
3. ne pas être un `PART`, `MERCHANDISE`, `CATALOGUE` ou `PROMOTIONAL_ITEM` ;
4. ne pas utiliser un format structuré de magazine, porte-clés ou décoration.

Les suffixes de marché ou de variante ne changent pas le rang numérique : `70201`, `70201-FRA` et les variantes de la même base restent groupées, puis sont départagées par leur valeur normalisée et leur identifiant.

Une référence `ASSIGNED`/`REUSED` qui ne remplit pas cette définition reste exploitable mais appartient au groupe spécial. Les `PLACEHOLDER`, `AMBIGUOUS`, `N/A`, variantes de `N/A` et bases composées uniquement de zéros appartiennent au dernier groupe. Aucune fiche n'est supprimée.

## Cas étudiés

- `01442403-GER` est une vraie valeur source, mais elle désigne **12 autocollants dinosaures**, classés `MERCHANDISE`, format `Other`, année 2024. Ce n'est pas une référence de boîte normale : elle reste accessible dans le groupe spécial.
- les références `3084....-GER` sont souvent des catalogues ou listes d'assortiment ; elles sont également spéciales et non supprimées ;
- `N/A` est explicitement `PLACEHOLDER` et passe en fin de tri ;
- `00000` et ses suffixes sont des placeholders et passent en fin de tri ;
- les références historiques `060-SCH`, `061-SCH`, etc. sont des sets commerciaux structurés de 1978 : leur base à trois chiffres est conservée comme commerciale ;
- les références de 4 chiffres, historiques ou récentes, restent commerciales lorsqu'elles satisfont les faits structurés ;
- les valeurs à cinq chiffres hors de la plage commerciale moderne observée (`99999`, `97668`, `91376`, etc.) restent accessibles dans le groupe spécial : elles ne sont plus autorisées à dominer le tri par leur seule valeur numérique ;
- les suffixes pays (`FRA`, `GER`, `ESP`, `UKP`, etc.) restent groupés avec la base ;
- les longues références de magazines, cadeaux, pansements, autocollants, catalogues ou figurines éditoriales restent dans le groupe spécial au lieu de dominer le tri numérique.

## Ordre final

Le mode `Référence` utilise, avant pagination : groupe croissant, base numérique croissante pour les références commerciales, référence normalisée puis identifiant comme départage déterministe. Une recherche exacte commence à la référence demandée et continue vers les suivantes. Les références spéciales et non collectionneur ne polluent donc plus les premières pages.
