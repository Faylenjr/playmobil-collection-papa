# Sources de données

État vérifié le 22 septembre 2026. Les nombres mesurent ce qui est observable, pas un total officiel de produits historiques.

| Source | Type | Accès mesuré | Volume observé | Décision actuelle |
|---|---|---|---:|---|
| Klickypedia | WordPress communautaire | `robots.txt` 200, sitemap autorisé ; REST `/wp-json/` explicitement interdit | 15 sitemaps, 14 467 URL `sets` | index sitemap activé, fiches à cadence lente |
| PLAYMOBIL DE | officiel Salesforce Commerce Cloud | robots et sitemap 200 | 546 URL dans le sitemap produits courant | source prioritaire pour produits présents |
| PLAYMOBIL FR | officiel Salesforce Commerce Cloud | robots et sitemap 200 | 327 URL dans le sitemap produits courant | noms FR et produits présents |
| PlaymoDB | base communautaire | page publique indexée ; client automatisé refusé 403 | 7 718 sets, 68 711 pièces, 6 023 sets avec pièces, 7 706 klickies annoncés | parseur prêt, import désactivé |
| Mundobil | catalogue/commerce communautaire | robots et sitemap 200 ; GPTBot interdit | 48 789 URL de sitemap, mélange de pièces/sets/pages | import désactivé avant classification/licence |
| Playmofanatic | éditorial communautaire | pages publiques et tableur annoncé | non mesuré | validation manuelle et variantes |

## Klickypedia

Le site expose un index Yoast `sitemap_index.xml` et 15 fichiers `sets-sitemap*.xml`. Son `robots.txt` daté de juillet 2026 interdit `/wp-json/`, les recherches paramétrées et plusieurs vues. L'endpoint WordPress techniquement imaginable n'est donc pas utilisé. Les URL de sitemap contiennent des slugs utiles, mais aucun nombre de références uniques n'est dérivé du slug sans lecture/validation de la fiche.

Les pages observées peuvent exposer titre, référence avec variante, années, traductions et URL d'image. Le droit de réhéberger ces images n'est pas établi.

## PLAYMOBIL

Les sitemaps actuels contiennent trois enfants par marché : produits, catégories et contenu. Une fiche produit officielle expose référence, nom localisé, description, médias structurés (`product_detail`, `product_box_front`, `product_box_back`), dimensions, poids, âge, figures/accessoires et un lien de notice. Le sitemap courant n'est pas une archive historique exhaustive.

## PlaymoDB

La page de statistiques publique annonce les quatre volumes ci-dessus et précise être non officielle. Elle indique aussi que les images et marques restent la propriété de geobra. Le serveur renvoie actuellement un interstitiel/403 au client d'import ; aucun contournement ne sera tenté.

## Mundobil

Le sitemap contient 40 000 URL dans le premier fichier et 8 789 dans le second. Ce total ne peut pas être appelé « sets » : les résultats mélangent pièces, lots, sets et contenu marchand. `robots.txt` autorise les pages générales mais interdit certaines recherches et plusieurs robots nommés ; un contact/licence est recommandé avant import massif.

## Playmofanatic

Source pertinente pour les versions et le Direkt Service. Le site annonce un tableur « all sets » et explique que certaines bases omettent les offres DS, accessoires, fins de série et rééditions. Le tableur doit être examiné avec sa licence avant ingestion.
