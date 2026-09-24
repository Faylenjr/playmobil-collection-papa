# Calibration du catalogue collectionneur

Audit effectué le 24 septembre 2026 en lecture seule sur la base de production (14 397 variantes).

## Cause du classement précédent

- Dans les grands thèmes échantillonnés, `piece_count` est absent sur toutes les variantes observées.
- `Standard Box` domine largement : 1 372 variantes `SET/STANDARD`, 798 `SET/MARKET` et 224 `SET/EDITION` dans l’échantillon multi-thèmes.
- L’ancien score donnait `+100` à tout `SET`, `+12` à toute `Standard Box`, `+15` à une référence assignée et `+8` aux éditions. Une petite édition ancienne pouvait donc battre un bâtiment récent.
- `figure_count` décrit le nombre de personnages inclus, pas la taille physique du set. Pris isolément, il favorisait des assortiments de figurines.

Exemples avant calibration :

- City Life commençait par quatre éditions de `Postmen and Telephone` (1979–1984), avant `Burger King Restaurant` (2026), `Large School` et `Large Gas Station`.
- Farm commençait par `Hay Wagon` et plusieurs `Farm Tractor Accessories` des années 1970–1980.
- Western plaçait de longues séries de variantes `U.S. Cavalry`, `Indian Camp` et personnages avant les forts et grands trains.

## Catégories explicables

Le score est désormais une catégorie ordinale. Le tri recommandé applique cette catégorie avant la date :

1. grand set (`100`) ;
2. bâtiment ou playset (`90`) ;
3. véhicule important (`80`) ;
4. set moyen (`70`) ;
5. petit set (`60`) ;
6. autre objet collectionnable (`50`) ;
7. figurine (`40`) ;
8. animal (`30`) ;
9. accessoire ou objet secondaire (`20`) ;
10. pièce détachée (`10`) ;
11. référence non assignée ou douteuse (`0`).

Les catégories utilisent exclusivement `Product.kind`, `format`, `pieceCount`, `figureCount`, la présence d’une référence assignée et des mots descriptifs littéraux du nom. Aucun signal de popularité, vente ou favori n’est créé. Les formats et termes secondaires (`Keychains`, `Magazine`, `Blister`, `Extension`, `Fence`, etc.) sont déclassés avant les règles de taille.

Exemples après calibration sur la même base :

- City Life : `Large School` (2023), `Large Gas Station` (2019), puis les bâtiments récents dont `Burger King Restaurant` (2026).
- Farm : `Large Farm` (2026), `Large Tractor` (2022), `Large Farm With Silo` (2019), puis les fermes et maisons récentes.
- Pirates : grands repaires et navires, puis `Pirate Harbor` (2025) et les forteresses.
- Western : `Large Western Cabin`, `SuperSet Native American Camp`, `Western Super Set`, grands trains, puis forts et ranchs récents.

Dans chaque catégorie, `releaseDate` est utilisée lorsqu’elle existe, sinon `releaseYear`. Aucune date précise n’est fabriquée pour l’affichage.

## Noms français et provenance

La base déployée ne contient actuellement qu’une source enregistrée : Klickypedia (`COMMUNITY_DATABASE`). Les tables comptent 9 241 traductions FR de variantes et 7 976 traductions FR de produits, mais aucune de ces lignes ne peut être reliée à une source `OFFICIAL` dans la base actuelle.

Le helper `getPreferredDisplayName()` n’emploie donc un nom FR que si un `SourceValue` `name.fr*` provient explicitement d’une source `OFFICIAL`. Dans l’état actuel, les titres canoniques sont conservés. La recherche continue néanmoins de couvrir les noms canoniques et toutes les traductions, ce qui permet de retrouver une fiche avec un nom français sans présenter cette traduction comme officielle.

## Sous-thèmes et gammes

Les 84 thèmes présents ont tous `parent_id = NULL`. Il n’existe donc aucune relation réelle parent/enfant à afficher et aucune gamme fiable distincte à déduire. L’interface et les requêtes savent afficher des enfants lorsqu’ils seront sourcés, mais ne créent aucune hiérarchie artificielle.

Les années disponibles sont agrégées depuis les variantes réellement rattachées au thème. Les années vides ne sont pas proposées.
