# Rapport de phase 0 — état intermédiaire

Date de mesure : 22 septembre 2026.

## Sources

Six familles ont été analysées : Klickypedia, PLAYMOBIL Allemagne, PLAYMOBIL France, PlaymoDB, Mundobil et Playmofanatic. L'audit automatisé est reproductible avec `pnpm source:audit`.

## Résultats mesurés

| Source | Mesure | Résultat |
|---|---|---:|
| Klickypedia | URL dans les 15 sitemaps de sets | 14 467 |
| PLAYMOBIL DE | URL du sitemap produits courant | 546 |
| PLAYMOBIL FR | URL du sitemap produits courant | 327 |
| PlaymoDB | sets annoncés par sa page de statistiques | 7 718 |
| PlaymoDB | pièces annoncées | 68 711 |
| PlaymoDB | sets avec inventaire de pièces | 6 023 |
| PlaymoDB | klickies annotés | 7 706 |
| Mundobil | URL totales des deux sitemaps | 48 789 |

Ces unités ne sont pas additionnables. Les 14 467 URL Klickypedia incluent des variantes ; les 48 789 URL Mundobil mélangent plusieurs types ; les sitemaps officiels décrivent surtout le catalogue courant.

## Déduplication et taxonomie

Le schéma et les tests distinguent produits, variantes et références. Le corpus complet n'a pas encore été importé ; les nombres avant/après déduplication sont donc **non mesurés** et restent `NULL`, plutôt que d'être estimés à partir des slugs. La taxonomie classique/variante/exclusivité/promotion/merchandising sera calculée après validation du corpus échantillon.

## Couverture

Le rapport SQL est implémenté, mais aucune base complète n'a été chargée dans cet environnement. Les pourcentages de catalogue sont donc non disponibles à ce stade. Ils ne seront publiés qu'à partir de vraies lignes PostgreSQL.

## Images

PLAYMOBIL fournit des URL de médias structurées ; Klickypedia fournit ses propres résumés/images. Aucune permission générale de réhébergement n'a été établie. Le modèle conserve URL, source, auteur, titulaire, licence, `can_rehost`, `can_display` et date de vérification. Aucun téléchargement massif n'a été effectué.

## Notices

Les fiches officielles observées lient le service de notices sur `playmobil.a.bigcontent.io`. Le parseur conserve l'URL et la locale. La couverture historique reste à mesurer.

## Pièces

PlaymoDB annonce 68 711 pièces et des inventaires dans 6 023 sets. C'est la source structurée la plus prometteuse pour les pièces, mais l'accès automatisé est actuellement refusé. Mundobil annonce près de 50 000 pièces sur ses pages publiques, sans que les 48 789 URL de sitemap puissent être assimilées à autant de pièces uniques.

## Problèmes et limites

- GitHub ne donne actuellement aucun accès au dépôt privé demandé ; le travail existe dans un dépôt Git local non synchronisé.
- Docker n'est pas installé dans l'environnement, donc Compose n'a pas été exécuté ici.
- Klickypedia interdit `/wp-json/` dans `robots.txt` ; cet endpoint n'est pas utilisé.
- PlaymoDB refuse le client automatisé ; aucun contournement n'est tenté.
- licences de bases et droits des médias à clarifier avant publication.
- il manque encore un corpus métier représentatif validé par un collectionneur.

## Recommandation

Conserver PostgreSQL et le modèle de provenance actuel. Continuer d'abord par un échantillon de 100 à 300 fiches équilibrées, faire valider les règles de variantes, puis élargir Klickypedia par sitemap et le catalogue officiel courant. N'intégrer PlaymoDB/Mundobil en masse qu'après accord ou conditions suffisamment claires. Différer le MVP jusqu'à des métriques de qualité réelles.
