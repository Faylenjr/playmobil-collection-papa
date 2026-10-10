# Exemplaires physiques de la collection

## Modèle

`CollectionItem` représente le rattachement unique entre une collection et une
`ProductVariant` du catalogue. `CollectionCopy` représente un exemplaire physique
réel. Une variante possédée trois fois possède donc un `CollectionItem` et trois
`CollectionCopy`.

Les variantes commerciales restent distinctes : une édition France et une édition
Allemagne ne sont jamais créées ou fusionnées pour représenter des doubles physiques.

## Migration des données historiques

La migration `20261010120000_collection_copies` crée une copie par unité de
`CollectionItem.quantity`, avec un minimum défensif de un. Les métadonnées physiques
historiques sont attribuées uniquement à la première copie. Les copies supplémentaires
restent inconnues afin de ne pas prétendre qu'une boîte, une notice ou un état
s'appliquent à tous les exemplaires.

Les colonnes historiques restent temporairement en base comme instantané de repli,
mais sont exposées dans Prisma sous les noms `legacy*`. Le code applicatif ne les lit
plus et ne les met plus à jour : le nombre actif est toujours `COUNT(CollectionCopy)`.
Elles pourront être supprimées dans une migration ultérieure après une période de
stabilité validée.

## Sémantique des dates

- `CollectionCopy.createdAt` : date d'ajout de l'exemplaire dans l'application.
- `CollectionCopy.updatedAt` : dernière modification de sa fiche physique.
- `CollectionCopy.purchaseDate` : date d'achat déclarée, indépendante et facultative.

## Suppression et modifications en série

Une suppression cible toujours une copie précise. Si la dernière copie est supprimée,
le `CollectionItem` devenu vide est supprimé dans la même transaction. Les actions en
série utilisent des identifiants de copies explicitement sélectionnées ; sélectionner
une référence ne modifie jamais implicitement tous ses exemplaires.
