# Interface collectionneur

## Ranking du catalogue

Le tri est calculé en SQL avant la pagination. Il n'utilise ni popularité ni
ventes. Le score combine des faits explicables : type de produit, nombre de
pièces, nombre de figurines incluses, format de boîte et présence d'une vraie
référence commerciale. Les sets passent avant les figurines, animaux,
accessoires et pièces. L'année puis la clé canonique départagent les scores
identiques.

## Collection principale

La V1 utilise un profil technique unique (`collectionneur@playmobil.local`),
créé au premier ajout avec une collection et une wishlist principales. Les
actions valident l'UUID reçu et relisent systématiquement la variante côté
serveur. Aucun secret ni identifiant utilisateur n'est exposé dans les formulaires.

## Choix des images

Les médias restent tous conservés. L'affichage privilégie aujourd'hui la
priorité de la `Source` : les sources officielles importées avec la priorité la
plus basse passent avant les sources communautaires, puis `kind` et l'URL
stabilisent l'ordre. Le faux logo Klickypedia reste exclu.

Le modèle ne permet pas encore de distinguer précisément, pour chaque média,
une image produit officielle courante d'une archive officielle ou d'un visuel
de boîte. Une future amélioration propre demanderait un rôle média normalisé
(par exemple `OFFICIAL_BOX_FRONT`, `OFFICIAL_PRODUCT`, `OFFICIAL_ARCHIVE`,
`COMMUNITY_PHOTO`) ou une provenance équivalente. Aucun crawl supplémentaire
n'est nécessaire pour l'interface actuelle.
