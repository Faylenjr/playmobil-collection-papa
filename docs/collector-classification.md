# Classification collectionneur structurée

Audit réalisé en lecture seule le 24 septembre 2026 sur les 14 397 variantes de la base déployée.

## Couverture réelle des champs

| Signal | Variantes | Couverture |
|---|---:|---:|
| `product.kind` significatif | 14 397 | 100,00 % |
| `variantKind` significatif | 14 397 | 100,00 % |
| `pieceCount` | 0 | 0,00 % |
| `figureCount` | 7 306 | 50,75 % |
| `format` | 14 397 | 100,00 % |
| référence commerciale assignée | 13 358 | 92,78 % |
| date ou année | 12 363 | 85,87 % |
| thème | 14 397 | 100,00 % |
| média | 14 388 | 99,94 % |
| relation figure | 0 | 0,00 % |
| relation pièce, variante ou produit | 4 742 | 32,94 % |

Les dimensions, le poids, le prix et `partsInventoryComplete` ne sont renseignés sur aucune variante. Les 4 742 inventaires de pièces ne sont jamais déclarés complets : leur nombre de relations ne peut donc pas prouver à lui seul qu’une boîte est grande.

Distribution de `product.kind` : 11 780 `SET`, 911 `FIGURE`, 622 `MERCHANDISE`, 562 `PROMOTIONAL_ITEM`, 522 `CATALOGUE`. Aucun produit n’est actuellement typé `PART` ou `ACCESSORY`.

Distribution de `variantKind` : 7 355 `STANDARD`, 3 841 `MARKET`, 1 637 `EDITION`, 1 340 `EXCLUSIVE`, 224 `PROMOTION`. Ce champ décrit l’édition ou le marché, pas la taille ni la nature physique du produit.

Les `SourceRecord` contiennent en revanche des tags structurés sur 122 catégories, notamment `buildings`, `castle`, `cars`, `trains`, `ships`, `animals`, `accessories` et `extensions`. Ils proviennent actuellement de Klickypedia, seule source enregistrée, et restent donc un signal communautaire plutôt qu’une taxonomie officielle Playmobil.

## Pourquoi les mots du nom ont été abandonnés

L’ancien score élevait directement un objet contenant `Large`, `Mega`, `castle`, `train` ou un terme voisin. L’échantillon réel montre que ces mots ne mesurent ni la taille de la boîte ni son importance : les inventaires sont incomplets, les noms varient selon les marchés et certaines appellations commerciales sont trompeuses.

La nouvelle classification ne lit jamais le nom du produit. Le `format` n’est utilisé que comme valeur catégorielle exacte (`Figures`, `Duo Pack`, `Magazin`, etc.), jamais comme recherche de sous-chaîne.

## Règles retenues

L’ordre recommandé est celui des classes, puis `releaseDate DESC`, sinon `releaseYear DESC`, puis la référence stable.

Les tris `Plus récent` et `Plus ancien` sont volontairement indépendants de cette classification : date exacte, puis année de sortie, puis référence stable. La page `/nouveautes` suit le même ordre purement chronologique. Le tri `Référence` utilise uniquement la référence normalisée et place les références non assignées à la fin.

1. `MAIN_SET` : `SET`, format boîte structuré et `pieceCount >= 150`. Cette classe vaut actuellement zéro car `pieceCount` n’est jamais renseigné.
2. `BUILDING_SET` : `SET` en boîte avec tag bâtiment direct, ou tag contextuel corroboré par une notice ou au moins huit relations de pièces.
3. `VEHICLE_SET` : `SET` en boîte avec tag véhicule fort ; les tags faibles comme `bicycles` ou `carts` exigent une notice ou des relations de pièces.
4. `SMALL_SET` : autre `SET` en `Standard Box` ou `Carrying Case` disposant d’une vraie référence.
5. `FIGURE_PACK` : produit `FIGURE`, format `Figures` ou `Duo Pack` avec plusieurs figurines documentées.
6. `SINGLE_FIGURE` : produit/format de figurine avec une figurine documentée.
7. `ANIMAL` : item `DS` portant uniquement des tags animaux, sans signal personne, bâtiment ou véhicule.
8. `ACCESSORY` : type accessoire, format secondaire structuré ou tag `accessories`/`extensions`/`storage`.
9. `PART` : uniquement `product.kind = PART`. Aucun cas actuel.
10. `CATALOGUE` : type catalogue ou format `Magazin`.
11. `PROMOTIONAL` : type marchandise/promotion ou `variantKind = PROMOTION`.
12. `UNKNOWN` : référence non assignée, format ambigu sans faits suffisants, ou combinaison non couverte.

Une référence placeholder force toujours `UNKNOWN`. Les mots `Large`, `Mega`, `Super`, `Big`, `box`, `vehicle` et `building` dans le nom n’ont aucun effet.

## Distribution obtenue

| Classe | Nombre | Part |
|---|---:|---:|
| `MAIN_SET` | 0 | 0,00 % |
| `BUILDING_SET` | 604 | 4,20 % |
| `VEHICLE_SET` | 1 614 | 11,21 % |
| `SMALL_SET` | 3 413 | 23,71 % |
| `FIGURE_PACK` | 284 | 1,97 % |
| `SINGLE_FIGURE` | 1 940 | 13,48 % |
| `ANIMAL` | 190 | 1,32 % |
| `ACCESSORY` | 2 456 | 17,06 % |
| `PART` | 0 | 0,00 % |
| `CATALOGUE` | 1 525 | 10,59 % |
| `PROMOTIONAL` | 838 | 5,82 % |
| `UNKNOWN` | 1 533 | 10,65 % |

La base permet donc une classification déterministe non `UNKNOWN` de 89,35 % des variantes, mais elle ne permet pas encore de distinguer honnêtement les très grandes boîtes des autres sets.

## Validation manuelle de 50 cas

L’échantillon est déterministe et stratifié à cinq objets par classe non vide. Résultat : 46 accords sur 50 (92 %). Les quatre désaccords sont conservés et documentés au lieu d’ajouter des mots-clés correctifs.

| Référence | Nom | Thème | Attendu | Obtenu |
|---|---|---|---|---|
| 3423-fam | Sheriff's Office | Western | BUILDING_SET | BUILDING_SET |
| 4725 | Take Along Soccer Match | Sports | BUILDING_SET | BUILDING_SET |
| 4256 | King with Throne | Princess | BUILDING_SET | BUILDING_SET |
| 3444v1 | Guard House | Old Houses | BUILDING_SET | BUILDING_SET |
| 70454 | Dressing Room | Princess | BUILDING_SET | BUILDING_SET |
| 23.21.5v1-trol | Police car | Police | VEHICLE_SET | VEHICLE_SET |
| 4033v2-usa | Large Western Train Set | Western | VEHICLE_SET | VEHICLE_SET |
| 3478-esp | Jeep & race motorbikes | Racing | VEHICLE_SET | VEHICLE_SET |
| 3053-usa | pirate ship | Pirates | VEHICLE_SET | VEHICLE_SET |
| 5542 | Fire Fighting Helicopter | Coastguard | VEHICLE_SET | VEHICLE_SET |
| 71390-ger | Shopper on bicycle | City Life | SMALL_SET | SMALL_SET |
| 30.20.01-est | hard-hat diver | Waterworld | SINGLE_FIGURE | SMALL_SET |
| 3745 | Roadworkers | Construction | SMALL_SET | SMALL_SET |
| 71701 | JUNIOR: Number-Merry-Go-Round | 1-2-3 | SMALL_SET | SMALL_SET |
| 6153 | Beach Photo Shoot | City Life | SMALL_SET | SMALL_SET |
| 70824 | DuoPack Air Stunt Show | Action | FIGURE_PACK | FIGURE_PACK |
| 5945-usa | Pirates and Skull Duo Pack | Pirates | FIGURE_PACK | FIGURE_PACK |
| 4128 | Duo Pack Princess and Magical Fairy | Fairies | FIGURE_PACK | FIGURE_PACK |
| 70735 | Figures Series 22 - Girls | Figures Series | FIGURE_PACK | FIGURE_PACK |
| 4770 | Halloween Set Trick or Treaters | Halloween | FIGURE_PACK | FIGURE_PACK |
| 72028v4 | Woman with umbrella | Figures Series | SINGLE_FIGURE | SINGLE_FIGURE |
| 5599v4 | Nurse | Hospital | SINGLE_FIGURE | SINGLE_FIGURE |
| 6964 | Tractor with Trailer | 1-2-3 | VEHICLE_SET | SINGLE_FIGURE |
| 4621-usa | Firefighter | Rescue | SINGLE_FIGURE | SINGLE_FIGURE |
| 70585v9 | Ms. S.Tyler | EverDreamerz | SINGLE_FIGURE | SINGLE_FIGURE |
| 7397 | 3 Gazelles | Safari | ANIMAL | ANIMAL |
| 7264 | Fox With 2 Kits | Country | ANIMAL | ANIMAL |
| 7943 | 3 Horses | Riding Stables | ANIMAL | ANIMAL |
| 23.27.0-trol | Horses | Western | ANIMAL | ANIMAL |
| 6357 | 2 Cows with Calfs, dark brown | Farm | ANIMAL | ANIMAL |
| 71973 | Track Blaster | Action | ACCESSORY | ACCESSORY |
| 7759 | Wall Extension for Rock Castle | Knights | ACCESSORY | ACCESSORY |
| 3795v2 | Harbour guard | Pirates | FIGURE_PACK | ACCESSORY |
| 80355 | Puzzle with 4 themes | Zoo | ACCESSORY | ACCESSORY |
| 71448 | Keeper with Animals | Zoo | SMALL_SET | ACCESSORY |
| 86108-ger | Add-Ons 2007-2008 | Merchandise | CATALOGUE | CATALOGUE |
| P017-esp | Playmobil Revista Pink 4/2019 | Wedding | CATALOGUE | CATALOGUE |
| 30794404-ger | Peter Venkman magazine | Ghostbusters | CATALOGUE | CATALOGUE |
| 20110302v7-fra | Stories That Make You Grow | Merchandise | CATALOGUE | CATALOGUE |
| P037-esp | Playmobil Revista Pink 7/2021 | Hospital | CATALOGUE | CATALOGUE |
| 3848 | Hot Dog Stand | City Life | PROMOTIONAL | PROMOTIONAL |
| 70720-ger | Postwoman | City Life | PROMOTIONAL | PROMOTIONAL |
| 30881102-ger | Gardner with assorted vase | City Life | PROMOTIONAL | PROMOTIONAL |
| 30792134-bel-fra | Pirate with pistol and torch | Pirates | PROMOTIONAL | PROMOTIONAL |
| 9123 | My market stall to take away | 1-2-3 | PROMOTIONAL | PROMOTIONAL |
| 5357 | Wild Horse Tournament Knight | Knights | UNKNOWN | UNKNOWN |
| 9143 | Captain Birds Eye | Harbour | UNKNOWN | UNKNOWN |
| 00000-esp | Playmobil Wonderful World Wiltopia 7 | Wiltopia | UNKNOWN | UNKNOWN |
| 074-sch | Fire Fighters Super Deluxe Set | Rescue | UNKNOWN | UNKNOWN |
| 00000-fra | Mon Tour du Monde avec Playmobil 1 | Merchandise | UNKNOWN | UNKNOWN |

## Limites et enrichissement ciblé recommandé

- `MAIN_SET` ne doit pas être inféré tant que la taille n’est pas sourcée. Le meilleur enrichissement est un `pieceCount` officiel ou un type produit officiel pour les variantes actuellement `SMALL_SET`/`UNKNOWN`.
- Les tags communautaires indiquent une famille d’objet, mais pas toujours le composant principal d’une boîte.
- Les relations de pièces sont partielles et leur absence ne signifie pas zéro pièce.
- `figureCount` manque sur 49,25 % des variantes ; cela explique les cas figurine contre petit set.
- Les thèmes comportent des rattachements manifestement transversaux ou historiques. Ce chantier ne modifie ni les identités ni les thèmes.

Une future table ou colonne persistée `collectorClass` ne serait utile qu’après acquisition de métadonnées plus fiables. Pour l’instant la classification reste calculée en SQL avant pagination : elle ne duplique pas une vérité encore évolutive et ne modifie aucune donnée catalogue.

Les faits structurés sont agrégés une seule fois dans des CTE puis joints avant pagination ; il n’y a ni tri JavaScript des 14 397 lignes ni N+1. Les tris chronologiques et par référence ne chargent pas ces agrégats.

Le script `scripts/audit-collector-classification.ts` reproduit les taux, l’échantillon de 50 cas et les vingt premiers résultats par thème sans écrire en base.
