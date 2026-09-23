# Rapport de phase 0 — mesures reproductibles

Date de mesure : 23 septembre 2026. Statut : **échantillon validé, catalogue complet non encore importé**.

## Sources

Six familles ont été analysées : Klickypedia, PLAYMOBIL Allemagne, PLAYMOBIL France, PlaymoDB, Mundobil et Playmofanatic. L'audit est reproductible avec `pnpm source:audit`.

| Source | Mesure directe | Résultat |
|---|---|---:|
| Klickypedia | URL indexées dans les 15 sitemaps `sets` | 14 467 |
| Klickypedia | URL de fiches après retrait de `/sets/` | **14 466** |
| PLAYMOBIL DE | URL du sitemap produits courant (audit du 22/09) | 546 |
| PLAYMOBIL FR | URL du sitemap produits courant (audit du 22/09) | 327 |
| PlaymoDB | sets annoncés par sa page de statistiques | 7 718 |
| PlaymoDB | pièces annoncées / sets inventoriés | 68 711 / 6 023 |
| Mundobil | URL totales des deux sitemaps, tous types confondus | 48 789 |

Ces unités ne sont pas additionnables. PlaymoDB reste désactivé car l'accès automatisé est refusé ; aucun contournement n'est utilisé. L'API WordPress de Klickypedia n'est pas appelée car `/wp-json/` est interdit par son `robots.txt`.

## Résultats importés

### Validation Klickypedia (200 fiches)

L'échantillon déterministe couvre 1974–2026, toutes les décennies demandées, les variantes `vN`, marchés, promotions, exclusivités, catalogues, merchandising et références atypiques.

| Mesure | Résultat |
|---|---:|
| fiches parcourues / créées | **200 / 200** |
| erreurs HTTP / fiches inaccessibles | **0 / 0** |
| valeurs de référence distinctes | **192** |
| produits de base | **197** |
| objets/variantes collectionnables | **200** |
| doublons effectivement fusionnés | **0** |
| conflits ouverts | **0** |
| tâches de revue d'identité | **12** |
| lignes de liens variante–pièce | **848** |

Une seconde exécution incrémentale a classé les **200 fiches comme inchangées**, sans les retélécharger ni créer de doublon.

Les 12 revues concernent des références génériques (`0`, `0000`, `00000`) qui ne sont pas des identifiants uniques. La première exécution les fusionnait à tort et produisait 25 conflits. La règle corrigée conserve leur référence affichée mais attribue à chaque fiche une identité stable dérivée de la source. Une seconde importation vierge a produit 200 objets distincts et zéro conflit artificiel.

### Enrichissement officiel mesuré

Deux petits lots réels ont testé huit références dans les deux marchés. PLAYMOBIL DE a fourni 5 fiches exploitables ; PLAYMOBIL FR en a fourni 1. Les autres URL ont répondu 404 et sont comptées comme inaccessibles, pas comme fiches absentes de toute l'histoire PLAYMOBIL.

Après enrichissement, la base de mesure contient :

| Mesure globale | Résultat |
|---|---:|
| enregistrements source persistés | **206** |
| références normalisées distinctes | **197** |
| produits de base | **200** |
| variantes/objets collectionnables | **205** |
| doublons fusionnés entre sources | **1** |
| conflits ouverts | **2** |
| références présentes dans une seule source | **196** |

Les deux conflits sont réels et conservés : pour la même référence, DE et FR divergent sur le statut (`archived`/`current`) et le prix catalogue (19,99/22,99). Ces valeurs sont dépendantes du marché ; elles devront à terme être matérialisées dans une table d'offres par marché, tout en restant déjà traçables dans `SourceValue`.

## Déduplication

- `Product` représente le produit de base ; `ProductVariant` représente l'objet collectionnable.
- Les références ne sont jamais converties en nombres.
- Les suffixes `vN`, éditions et marchés sont interprétés de façon conservatrice.
- Les références-placeholder sont disambiguïsées par l'identité du `SourceRecord` et placées en revue.
- Une fusion n'est acceptée que lorsque les signaux d'identité ne se contredisent pas.
- Les hashes HTML et `lastmod` évitent de retraiter une fiche inchangée ; le curseur d'`ImportRun` permet la reprise.

## Taxonomie mesurée (base enrichie, 205 objets)

| Produits | Nombre |
|---|---:|
| sets | 167 |
| figurines | 15 |
| catalogues | 8 |
| merchandising | 7 |
| objets promotionnels | 3 |

| Variantes | Nombre |
|---|---:|
| standard | 107 |
| marché | 52 |
| édition/version | 27 |
| exclusive (type) | 18 |
| promotion (type) | 1 |

Les drapeaux transversaux recensent 47 exclusivités et 4 promotions ; ils ne s'excluent pas des types structurels marché/édition.

## Couverture mesurée

Pourcentages calculés depuis PostgreSQL/PGlite sur les 205 objets après enrichissement officiel :

| Champ | Présent | Couverture |
|---|---:|---:|
| référence | 205 | **100 %** |
| nom | 205 | **100 %** |
| nom français | 134 | **65,37 %** |
| année de sortie | 177 | **86,34 %** |
| année de retrait | 75 | **36,59 %** |
| thème | 200 | **97,56 %** |
| image principale | 203 | **99,02 %** |
| boîte avant | 113 | **55,12 %** |
| boîte arrière | 83 | **40,49 %** |
| notice | 71 | **34,63 %** |
| nombre de figurines | 101 | **49,27 %** |
| nombre total de pièces | 0 | **0 %** |
| au moins une pièce liée | 69 | **33,66 %** |
| inventaire de pièces déclaré complet | 0 | **0 %** |

La répartition des années Klickypedia contient 12 objets des années 1970, 10 des années 1980, 16 des années 1990, 20 des années 2000, 66 des années 2010 et 50 des années 2020, dont 8 datés 2026.

## Images

Les importeurs ne téléchargent aucun média. Ils conservent l'URL, la source, le titulaire connu, la licence éventuelle, `can_rehost`, `can_display` et la date de vérification. Les images officielles sont marquées `can_rehost = false`. Aucune permission générale de réhébergement n'a été établie pour Klickypedia ou PLAYMOBIL.

## Notices

Les pages officielles exposent des liens vers `playmobil.a.bigcontent.io`. Les URL et locales sont persistées avec `can_rehost = false`. La couverture actuelle de 34,63 % est celle du corpus de mesure, pas du catalogue historique complet.

## Pièces et figurines

Les relations existent aux niveaux produit **et variante**. L'import Klickypedia a créé 848 liens variante–pièce sur 69 variantes, sans inventer les quantités ni déclarer les inventaires complets. Le total de pièces reste donc `NULL` et la couverture `parts_count` reste honnêtement à 0 %. PlaymoDB pourrait améliorer ce point, mais son import demeure désactivé.

## Problèmes restant ouverts

- L'import complet de 14 466 fiches n'a pas été exécuté dans cette session : à la cadence validée (1,5–2 s minimum, séquentielle), il nécessite environ 6 à 9 heures. Le job est prêt, reprenable et journalisé avec `pnpm import:klickypedia:full`.
- La disponibilité des archives officielles diffère fortement entre DE et FR ; un 404 n'est pas une preuve d'inexistence historique.
- Les prix et statuts officiels sont dépendants du marché ; une table d'offres par marché est recommandée avant un import officiel large.
- Les licences de base et droits d'affichage des médias doivent être clarifiés avant publication publique ou usage commercial.
- Les règles d'identité ambiguë doivent être contrôlées sur un lot plus large avant de déclarer la phase 0 terminée.

## Recommandation

Conserver PostgreSQL, Prisma et le modèle de provenance actuel. Exécuter ensuite le job Klickypedia complet sur un worker durable avec PostgreSQL managé, sans augmenter la cadence, puis générer ce rapport depuis la base complète. L'enrichissement officiel doit suivre par lots et par marché. Le MVP utilisateur reste différé jusqu'à obtention des métriques complètes.
