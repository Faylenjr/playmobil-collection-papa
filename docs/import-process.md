# Processus d'import

1. Auditer `robots.txt`, conditions, sitemaps et statut HTTP.
2. Indexer les URL autorisées sans télécharger les médias.
3. Sélectionner un échantillon multi-décennies et multi-marchés.
4. Extraire vers `RawCollectible` sans inventer les absences.
5. Normaliser la référence avec une règle testée.
6. Upsert du `SourceRecord` et comparaison du hash.
7. Enregistrer chaque `SourceValue`.
8. Résoudre par priorité, confiance puis récence ; ouvrir un conflit si les valeurs divergent.
9. Produire le rapport de couverture et les erreurs.

## Résilience

Le client applique délai minimum par origine, timeout, backoff exponentiel et trois retries au maximum. Les statuts 429/5xx sont réessayés ; une erreur de fiche ne doit pas annuler un lot. La concurrence par défaut est limitée à deux et ne doit pas être augmentée sans justification.

## Échantillon requis avant import complet

Le jeu de validation doit couvrir 1970, 1980, 1990, 2000, 2010, 2020 et l'année courante, plus : suffixes `vN`, lettre, marchés, promotions, exclusivités, Direkt Service, merchandising et rééditions. Les fixtures du dépôt ne sont que des tests techniques minimaux ; elles ne constituent pas encore ce corpus métier.

## Synchronisation

- PLAYMOBIL : sitemap/nouveautés quotidien, fiches modifiées seulement.
- Klickypedia : sitemaps et `lastmod`, sans `/wp-json/` tant que son `robots.txt` l'interdit.
- PlaymoDB et Mundobil : cadence lente et uniquement après clarification d'accès/licence.
