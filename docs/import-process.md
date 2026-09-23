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

## Exécution complète

L'import complet a été exécuté sur le homelab depuis une connexion résidentielle. Les runners GitHub/Azure recevaient des réponses 403 de Klickypedia ; les workflows de crawl correspondants ont donc été retirés. La CI GitHub reste limitée aux tests, au typecheck, au build et à la validation Prisma. Les prochains imports longs doivent utiliser le worker du homelab ou une infrastructure explicitement acceptée par la source.

## Synchronisation

- PLAYMOBIL : sitemap/nouveautés quotidien, fiches modifiées seulement.
- Klickypedia : sitemaps et `lastmod`, sans `/wp-json/` tant que son `robots.txt` l'interdit.
- PlaymoDB et Mundobil : cadence lente et uniquement après clarification d'accès/licence.
