# Qualité de la collection réelle

Audit en lecture seule du 9 octobre 2026, reproductible avec `pnpm collection:audit-quality`.

## Couverture des 609 entrées

| Champ | Oui / renseigné | Non | Inconnu (`NULL` ou `UNKNOWN`) |
| --- | ---: | ---: | ---: |
| état | 1 | — | 608 |
| complétude | 0 | 0 | 609 |
| boîte | 0 | 0 | 609 |
| notice | 0 | 0 | 609 |
| date d'achat | 0 | — | 609 |
| prix d'achat | 0 | — | 609 |
| notes | 0 | — | 609 |

Les 609 lignes représentent 611 exemplaires physiques et 606 produits logiques. Une seule ligne possède une quantité supérieure à un (`4359`, quantité 3). Trois produits logiques ont deux lignes sur des variants distincts : `19065`, `9332` et `9333`. Ils sont signalés comme potentiels doublons de saisie, mais jamais fusionnés automatiquement.

Le modèle actuel impose une ligne par `(collection, variant)`. La quantité convient aux exemplaires physiquement équivalents. Deux exemplaires du même variant ayant un état ou une boîte différents ne peuvent pas encore être décrits séparément ; aucune migration n'est imposée tant que ce besoin réel n'est pas confirmé.

## Séries de figurines

Le thème communautaire `Figures Series` couvre 70 variants et 65 produits, dont 60 produits de type figurine. Plusieurs produits de série possèdent 13 ou 14 variants internes, mais un seul variant est parfois rattaché au thème (`5157`, `5158`, `5203`, `5204`, `5243`, `5244`, etc.). La relation `VariantTheme` ne porte pas directement sa provenance : une correction automatique ferait donc courir un risque supérieur au défaut actuel. Aucun rattachement n'a été modifié. Les progressions continuent de dédupliquer par `Product`.

## Noms français 2026

La couverture reste de 204 références sur 223. Les 19 références sans nom français fiable sont :

`72028`, `72083`, `72084`, `72085`, `72086`, `72087`, `72088`, `72185`, `72186`, `72187`, `72188`, `72189`, `72190`, `72214`, `72233`, `72236`, `72341`, `72449`, `72450`.

Aucun `SourceRecord` PLAYMOBIL officiel français déjà présent n'est associé à ces références. Le nom original est donc conservé ; aucune traduction automatique n'est créée.

## Gammes officielles

Les 11 gammes existantes totalisent 36 appartenances, toutes sourcées par le corpus officiel PLAYMOBIL USA déjà audité : Animals & Friends (3), ESA Space Range (4), Funstars (2), Knights (8), Magic Unicorns (3), Monster High (1), My Life (3), Offroad Cars (4), PLAYMOBIL Figures Series 29 (2), PLAYMOBIL JUNIOR (3), Soccer (3).

Les sources déjà présentes ne prouvent pas d'autres appartenances sans interprétation. L'absence de gamme reste donc préférable à une classification inventée.
