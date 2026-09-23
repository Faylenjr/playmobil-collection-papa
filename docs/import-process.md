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

Le client applique délai minimum par origine, timeout, backoff exponentiel et trois retries au maximum. Les statuts 429/5xx sont réessayés ; une erreur de fiche ne doit pas annuler un lot. L'import de fiches est séquentiel et applique par défaut au moins 1,5 seconde entre requêtes d'une même origine. Cette cadence ne doit pas être augmentée sans justification.

## Échantillon requis avant import complet

Le lot déterministe de 200 fiches couvre 1970, 1980, 1990, 2000, 2010, 2020 et l'année courante, plus : suffixes `vN`, marchés, promotions, exclusivités, merchandising et rééditions. Il a permis de détecter puis corriger la collision des références `0000`/`00000`. Les fixtures restent des tests hors réseau minimaux.

## Commandes d'import

```bash
pnpm import:klickypedia:sample
pnpm import:klickypedia:full
pnpm import:playmobil -- --limit=20
pnpm report
```

Le job Klickypedia mémorise son index et son curseur dans `ImportRun`. `--resume` reprend un run `RUNNING`, `PARTIAL` ou `FAILED` si la sélection de sitemap n'a pas changé. PLAYMOBIL DE/FR enrichit uniquement des références déjà connues, sauf liste explicite passée avec `--references=`.

## Import nocturne GitHub Actions

Le workflow manuel `Klickypedia full import` propose deux modes :

- `smoke` importe cinq fiches dans une base vierge et publie ses rapports pendant trois jours ;
- `full` exécute huit jobs strictement chaînés, soit sept lots de 1 900 fiches et un dernier lot de 1 166.

Chaque job restaure le checkpoint PGlite exact produit par son prédécesseur. L'absence du checkpoint fait échouer le lot au lieu de repartir silencieusement d'une base vide. Les caches sont propres au `run_id`, empêchant deux exécutions de mélanger leurs données. Le dernier job publie pendant 30 jours :

- la base PostgreSQL/PGlite complète ;
- `coverage.json` ;
- `anomalies.json` ;
- `catalogue-export.json`, qui contient notamment toutes les URL et tous les journaux d'import.

Une relance d'un lot déjà terminé réutilise `lastmod` et les hashes. Un run `PARTIAL` arrivé au bout est recréé afin de retenter ses URL en erreur ; les fiches réussies et inchangées sont ignorées.

## Synchronisation

- PLAYMOBIL : sitemap/nouveautés quotidien, fiches modifiées seulement.
- Klickypedia : sitemaps et `lastmod`, sans `/wp-json/` tant que son `robots.txt` l'interdit.
- PlaymoDB et Mundobil : cadence lente et uniquement après clarification d'accès/licence.
