# Audit de sortie du homelab vers une production cloud

Date de l'audit : 26 septembre 2026
Périmètre : audit en lecture seule. Aucun déploiement Cloudflare, aucune migration, aucune modification DNS ou de données n'a été effectué.

## Décision

**Architecture recommandée : Cloudflare Workers + Neon Postgres (région Francfort) + Cloudflare Hyperdrive, avec Workers Paid et Neon Launch pour la production.**

Le choix conserve PostgreSQL 17, Prisma et les requêtes de classement existantes. Il élimine la dépendance du site public au homelab sans introduire de synchronisation bidirectionnelle. Supabase reste une bonne option B si un coût fixe d'environ 25 USD/mois et une base toujours active sont préférés à l'élasticité de Neon.

L'adaptateur Cloudflare doit faire l'objet d'un pilote sur une URL temporaire : Cloudflare recommande actuellement vinext pour Next.js sur Workers, mais le qualifie encore de beta. Le contrôle `vinext check` du dépôt a annoncé 100 % de compatibilité syntaxique. OpenNext reste le repli conservateur si le test d'exécution réel révèle une incompatibilité.

## 1. État réel de l'application

- Next.js 16.3.6, App Router, React 19.3, Node 24 en CI et en image Docker.
- Prisma 7.10 avec `@prisma/adapter-pg` 7.10 et `pg` 8.16.3.
- PostgreSQL 17.11 sur le homelab.
- Sept pages dynamiques : accueil, catalogue, collection, nouveautés, recherches, fiche produit et thèmes.
- Une famille de Server Actions modifie collection et wishlist.
- Toutes les pages principales utilisent `force-dynamic` et lisent PostgreSQL au rendu.
- Aucun Route Handler/API route ni middleware n'est présent.
- Les images sont des URLs externes rendues par un composant HTML ; `next/image` n'est pas utilisé.
- Les imports, crawlers, audits, réparations et PGlite utilisent des API Node et/ou des traitements longs. Ils sont hors du chemin web et peuvent rester sur le homelab.
- Dans le chemin web, l'accès Node spécifique est essentiellement `process.env`, Prisma, `pg` et l'adaptateur PostgreSQL. Workers les prend en charge avec `nodejs_compat`, mais une recette dans `workerd` reste obligatoire.

Le catalogue ne fait pas de N+1 par carte : il sélectionne une page d'identifiants, charge les fiches en lot, charge les noms français en lot et les statuts collection en lot. Il effectue néanmoins plusieurs aller-retours séquentiels par rendu. La fiche produit utilise des inclusions bornées pour les figures et pièces.

Les requêtes de recherche et de classement utilisent notamment `ILIKE`, `jsonb`, `?|`, expressions régulières PostgreSQL, casts, `MAKE_DATE`, `DISTINCT ON`, agrégats filtrés, fenêtres et `NULLS LAST`. Les réparations hors ligne utilisent aussi verrou consultatif, verrou de table et transactions complexes.

## 2. Profil PostgreSQL mesuré

Mesures en lecture seule sur la production homelab :

| Mesure | Valeur |
| --- | ---: |
| Taille totale PostgreSQL | 136 MB (142 948 019 octets) |
| Dump complet `pg_dump -Fc` diffusé sans fichier permanent | 18,4 MiB (19 294 325 octets) |
| Tables du schéma public | 32 |
| Index | 63 |
| Taille cumulée des index | 49 MB |
| Product | 12 373 |
| ProductVariant | 14 397 |
| SourceRecord | 14 466 |
| SourceValue | 120 531 |
| MediaAsset | 28 859 |
| Conflict | 121 |
| Theme | 84 |
| Collection / CollectionItem | 1 / 1 |
| Wishlist / WishlistItem | 1 / 1 |
| ProductRange / ReleaseWave | absentes |

Les plus grosses tables sont `source_values` (40 MB), `source_records` (29 MB), `media_assets` (11 MB), `variant_translations` (8,7 MB), `translations` (7,5 MB), `product_references` (7,4 MB) et `variant_parts` (6,8 MB).

`media_assets` contient uniquement des UUID, chaînes, booléens et dates. Aucun `bytea` ni média binaire n'est stocké. Les 14 466 `raw_payload` représentent environ 7,7 MiB de JSON au total.

La seule extension est `plpgsql`. Il n'existe ni fonction applicative, ni trigger personnalisé, ni extension trigram/full-text. Le schéma contient huit enums Prisma/PostgreSQL, 38 clés étrangères, 32 clés primaires et les contraintes de vérification générées. Une migration vers un PostgreSQL 17 managé est donc standard.

## 3. Pourquoi D1 n'est pas retenu

D1 est SQLite, alors que le projet exploite directement des constructions PostgreSQL dans le chemin web. Le passage à D1 obligerait à réécrire le schéma, les enums, une partie de la recherche et du ranking, les migrations et les tests d'import. Il faudrait aussi revalider la concurrence et la sémantique transactionnelle.

La taille actuelle entrerait dans D1 Free (500 MB), mais ce n'est pas le critère décisif. D1 limite aussi chaque base à 10 GB sur le plan payant, exécute une base sur un moteur mono-thread et facture/limite selon les lignes lues et écrites. Ce modèle est moins adapté aux CTE de classement qui parcourent des ensembles importants. [Limites D1](https://developers.cloudflare.com/d1/platform/limits/) et [tarification D1](https://developers.cloudflare.com/d1/platform/pricing/).

**Conclusion D1 : non adapté sans migration disproportionnée, sans bénéfice produit pour ce catalogue.**

## 4. Neon et Supabase

Les tarifs changent ; les chiffres ci-dessous sont ceux publiés par les fournisseurs à la date de l'audit.

| Sujet | Neon | Supabase |
| --- | --- | --- |
| PostgreSQL 17 | Oui | Oui |
| Gratuit | 0,5 GB de base par projet, 100 CU-h/mois selon l'annonce officielle la plus récente, mise à zéro après inactivité | 500 MB par projet, deux projets gratuits |
| Comportement inactif | compute suspendu après 5 min par défaut, réveil transparent avec quelques centaines de ms supplémentaires | un projet Free insuffisamment actif peut être mis en pause après 7 jours ; reprise via la plateforme, pas un simple cold start de requête |
| Offre production raisonnable | Launch à l'usage, sans minimum publié ; compute 0,106 USD/CU-h et stockage 0,35 USD/GB-mois | Pro 25 USD/mois ; un Micro à ~10 USD est couvert par 10 USD de crédit compute |
| Pooling fournisseur | PgBouncer intégré, jusqu'à 10 000 connexions clientes annoncées | Supavisor partagé, modes session et transaction ; Micro : environ 200 connexions pooler |
| Sauvegarde/PITR | restauration instantanée : 6 h sur Free ; jusqu'à 7 jours sur Launch, historique facturé selon le volume de changements | aucune sauvegarde automatique en Free ; Pro : sauvegarde quotidienne, rétention 7 jours ; PITR 7 jours ~100 USD/mois et au moins un compute Small |
| Région pertinente | AWS Francfort disponible | Francfort et Paris disponibles |
| Export | PostgreSQL standard, `pg_dump`/`pg_restore` | PostgreSQL standard, `pg_dump`/`pg_restore` |
| Verrou fournisseur | faible pour les données ; branching et restauration sont propriétaires | faible pour les données ; Auth/Storage/API seraient propriétaires, mais ne sont pas nécessaires ici |

Sources : [Neon, changement de prix et doublement du gratuit](https://neon.com/blog/major-compute-price-reduction-on-neon), [Neon, compute et pooling](https://neon.com/docs/manage/endpoints/), [Supabase, facturation](https://supabase.com/docs/guides/platform/billing-on-supabase), [Supabase, compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [Supabase, pause du Free](https://supabase.com/docs/guides/platform/free-project-pausing), [Supabase, sauvegardes et PITR](https://supabase.com/docs/guides/platform/backups), [régions Supabase](https://supabase.com/docs/guides/platform/regions).

### Coût estimé

La production doit utiliser Workers Paid, car le plan Free limite le CPU à 10 ms par invocation, seuil trop serré pour un rendu Next dynamique. Workers Paid coûte au minimum 5 USD/mois, inclut 10 millions de requêtes et 30 millions de ms CPU mensuels. Hyperdrive est inclus ; le plan Free limite Hyperdrive à 100 000 requêtes SQL/jour, le plan Paid les rend illimitées. [Tarification Workers](https://developers.cloudflare.com/workers/platform/pricing/) et [tarification Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

Pour Neon Launch à 0,25 CU :

- 25 heures actives/mois : environ 0,66 USD de compute ;
- 100 heures actives/mois : environ 2,65 USD ;
- actif 24 h/24 : environ 19,35 USD ;
- 136 MB de stockage : moins de 0,05 USD/mois ;
- PITR d'une base avec très peu d'écritures : normalement quelques centimes, à mesurer après un mois.

Scénario actuel, 1 à 3 utilisateurs : **environ 6 à 9 USD/mois**, Workers compris, si la base peut se suspendre. Scénario futur, 5 à 20 utilisateurs : **environ 8 à 16 USD/mois** dans une hypothèse de 100 à 400 heures actives à 0,25 CU. Une base réellement active en permanence porterait l'ensemble vers **25 USD/mois**.

Supabase Free peut héberger les 136 MB, mais la pause après faible activité et l'absence de sauvegarde automatique ne conviennent pas à la production visée. Supabase Pro avec un Micro et sauvegardes quotidiennes coûte **environ 25 USD/mois**. Avec PITR 7 jours et le compute Small requis, l'ordre de grandeur devient **environ 130 USD/mois**.

## 5. Pooler fournisseur ou Hyperdrive

Trois chemins sont possibles :

1. Worker vers le pooler Neon/Supabase : simple, mais chaque requête traverse la distance Worker-base et le pool est propre au fournisseur.
2. Worker placé près de la base vers le pooler fournisseur : bon compromis sans Hyperdrive.
3. Worker vers Hyperdrive, puis connexion directe au fournisseur : recommandé pour cette application.

Hyperdrive réduit le coût des négociations TCP/TLS/authentification, maintient le pool près de la base et peut placer le Worker près du PostgreSQL. Cloudflare indique que plusieurs requêtes séquentielles peuvent passer d'environ 20-30 ms de trajet chacune à 1-3 ms lorsque le Worker est correctement placé. [Fonctionnement Hyperdrive](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) et [Placement Workers](https://developers.cloudflare.com/workers/configuration/placement/).

Il ne faut pas empiler Hyperdrive devant PgBouncer/Supavisor. Les guides Cloudflare pour [Neon](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/) et [Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) demandent explicitement le point d'accès **direct**, pooling désactivé côté fournisseur.

Configuration cible :

- Hyperdrive vers l'endpoint direct Neon Francfort, TLS obligatoire ;
- rôle PostgreSQL runtime dédié et non propriétaire ;
- `nodejs_compat` ;
- `DATABASE_URL` runtime provenant de `env.HYPERDRIVE.connectionString` ;
- `DIRECT_URL` privilégiée uniquement dans le workflow manuel de migration, jamais dans le Worker ;
- cache de requêtes Hyperdrive désactivé au début pour préserver la cohérence immédiate collection/wishlist. Une configuration séparée avec cache pourra être testée plus tard pour les lectures immuables.

Le dépôt a déjà la version minimale `pg` 8.16.3 demandée par Hyperdrive. Prisma documente `@prisma/adapter-pg` avec `nodejs_compat` sur Workers. [Prisma sur Workers](https://www.prisma.io/docs/guides/v7/deployment/cloudflare-workers) et [Prisma avec Cloudflare/pg](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/edge/deploy-to-cloudflare).

Point à prouver dans le pilote : cycle de vie du pool Prisma dans un isolate Worker. Le client global actuel convient à Node/Docker ; il faudra vérifier sous charge qu'il ne conserve pas de connexion obsolète et que les transactions passent correctement par Hyperdrive.

## 6. Cloudflare Workers, Pages, vinext et OpenNext

Pages ne doit pas être choisi pour cette application dynamique. Cloudflare indique désormais que Workers est sa plateforme principale ; Pages convient ici seulement à un export Next statique. [Guide Pages/Next](https://developers.cloudflare.com/pages/framework-guides/nextjs/) et [guides Pages](https://developers.cloudflare.com/pages/framework-guides/).

Workers prend en charge App Router, Server Components, SSR, Server Actions, routes dynamiques, streaming, middleware et ISR avec les adaptateurs documentés. Cloudflare recommande actuellement vinext pour une nouvelle intégration Next.js ; vinext reste beta et l'optimisation d'images n'est que partiellement prise en charge. [Guide Next.js/vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).

Le contrôle local `vinext check` a trouvé 3/3 imports Next supportés, 2/2 bibliothèques reconnues compatibles, les 7 pages App Router et aucune incompatibilité syntaxique. Il ne teste pas la base réelle, le bundle final ni les mutations.

Décision d'adaptateur :

1. branche de migration dédiée ;
2. `vinext init` sans déploiement ;
3. build et preview Workers ;
4. recette complète sur une copie de base ;
5. si Prisma, streaming ou Server Actions échouent, repli vers l'adaptateur OpenNext, qui documente le support de ces fonctions mais n'est plus le chemin conseillé pour les nouveaux projets. [Support OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/).

## 7. Performance et latence

Temps de première réponse mesurés depuis le poste vers le LAN, une passe non mise en cache :

| Page | TTFB |
| --- | ---: |
| Accueil | 0,72 s |
| Catalogue | 1,03 s |
| Recherche `pirates` | 1,13 s |
| Thèmes | 0,56 s |
| Nouveautés | 0,81 s |
| Collection | 0,73 s |
| Wishlist | 0,22 s |

Le réseau LAN se connecte en 6 à 9 ms ; la majorité de ce temps est donc déjà le rendu et les requêtes SQL. Le cloud n'effacera pas le coût du ranking. Il faudra conserver la pagination SQL, mesurer les plans d'exécution et envisager des index seulement sur preuve.

Neon publie environ 8 ms pour une requête chaude entre un compute applicatif et PostgreSQL tous deux à Francfort. Ce chiffre n'est pas une mesure de ce projet. Pour Workers + Hyperdrive placés à Francfort, une latence basse à un chiffre entre Worker et DB est une attente raisonnable, à confirmer par un test synthétique et les vraies pages.

Cold start : Workers n'est pas le risque principal. Neon suspend le compute après 5 minutes par défaut et annonce quelques centaines de millisecondes pour le réveil. Le premier affichage après une période calme pourra donc être plus lent. Trois choix : l'accepter, désactiver la suspension sur Launch, ou ne la désactiver qu'après mesure. Supabase Pro ne se met pas en pause et offre une latence plus constante ; Supabase Free peut mettre le projet entier en pause après 7 jours de faible activité, ce qui est impropre à une production fiable.

## 8. Architecture cible et source d'autorité

```text
GitHub
  |-- CI : tests, types, build, Prisma validate
  |-- version Worker / preview
  v
Cloudflare Workers (vinext pilote, OpenNext repli)
  |-- domaine public en lecture
  |-- domaine admin protégé par Cloudflare Access
  |-- Hyperdrive, cache initialement désactivé
  v
Neon Postgres 17, Francfort
  |-- PROD unique et autorité des données
  |-- Instant Restore / PITR
  +-- dumps chiffrés vers R2

Homelab
  |-- développement et staging local
  |-- imports/crawlers/jobs longs
  |-- contrôles dry-run avant écriture cloud
  +-- copie secondaire de sauvegarde
```

Neon PROD devient l'unique maître. Le PostgreSQL homelab n'est jamais synchronisé dans les deux sens. Un import local produit un plan déterministe et auditable ; après validation explicite, un job à sens unique applique ce plan à PROD avec identifiants idempotents et compteurs avant/après. Les données PROD sont redescendues vers le homelab par restauration d'un dump, jamais par fusion libre.

## 9. Authentification minimale avant publication

L'état actuel est bloquant : toute personne pouvant atteindre le site peut déclencher les Server Actions et modifier le profil partagé `collectionneur@playmobil.local`.

Solution minimale, sans ajouter un système de comptes :

1. garder `playmobil.homeclap.ovh` public mais strictement en lecture ;
2. servir le même Worker sur `admin.playmobil.homeclap.ovh` ;
3. protéger tout le sous-domaine admin avec Cloudflare Access, autorisé seulement aux adresses e-mail du père et de l'administrateur ; le plan Access est gratuit jusqu'à 50 utilisateurs ;
4. masquer les contrôles d'écriture sur l'hôte public ;
5. ajouter `requireCollectorAdmin()` au début de **chaque** Server Action ;
6. vérifier l'audience, l'émetteur et la signature du JWT Access, et pas seulement la présence d'un en-tête ;
7. bloquer aussi `workers.dev`, URLs de preview et domaines alternatifs, ou les protéger par Access ;
8. journaliser les mutations sans notes sensibles et appliquer un rate limit aux POST.

Cloudflare vérifie le cookie `CF_Authorization` devant l'application et fournit `Cf-Access-Jwt-Assertion`. La documentation précise que l'en-tête seul ne suffit pas si le token n'est pas validé. [Cookie Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [validation JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) et [tarifs Access](https://www.cloudflare.com/sase/products/access/).

Ce sous-domaine admin évite de protéger `/sets/*`, qui doit rester public mais contient aujourd'hui les formulaires de mutation. Une simple règle Access sur `/collection` et `/recherches` ne suffirait donc pas.

## 10. Secrets et rôles PostgreSQL

- `hyperdrive_runtime` : `CONNECT` et droits strictement nécessaires sur les tables/séquences ; aucun DDL, aucune création de rôle.
- `prisma_migrator` : rôle séparé, utilisé seulement par le workflow manuel protégé.
- `import_writer` : rôle distinct, activé seulement pour les pipelines d'import contrôlés.
- TLS obligatoire entre Hyperdrive et Neon.
- Secrets Cloudflare, jamais des `vars` en clair ni un fichier suivi par Git. [Secrets Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
- Jeton Cloudflare GitHub limité au Worker et à la zone nécessaires.
- Rotation documentée des mots de passe et jetons ; révocation immédiate des anciennes valeurs.
- La base Neon reste accessible sur Internet par conception, mais uniquement par TLS, identifiants forts et privilèges minimaux. Les allowlists IP ne sont pas nécessaires au petit plan recommandé et sont peu pratiques avec un edge distribué ; Hyperdrive réduit l'exposition des identifiants au Worker.

## 11. Sauvegardes, PITR et R2

Politique recommandée :

- Neon Launch Instant Restore/PITR : 7 jours ;
- dump logique quotidien : 7 jours ;
- dump hebdomadaire : 4 semaines ;
- dump mensuel : 6 mois ;
- copie homelab mensuelle ou après import important ;
- test de restauration mensuel dans une base temporaire.

Chaque sauvegarde doit inclure : dump `pg_dump -Fc`, SHA-256, version PostgreSQL, commit Git, liste des migrations Prisma, horodatage UTC, taille et compteurs clés. Le job recalcule le SHA-256 après téléchargement et ne marque la sauvegarde valide qu'après `pg_restore --list`. Le test mensuel restaure réellement, lance les invariants et détruit ensuite seulement la base temporaire.

R2 est adapté aux dumps privés et rapports d'import. Son niveau gratuit offre 10 GB-mois, largement au-dessus d'environ 313 MiB pour 17 dumps à la taille actuelle. R2 chiffre automatiquement les objets au repos en AES-256 et les transferts utilisent TLS. Il accepte un checksum SHA-256 et des règles de cycle de vie. [Tarifs R2](https://developers.cloudflare.com/r2/pricing/), [sécurité R2](https://developers.cloudflare.com/r2/reference/data-security/), [checksums](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) et [lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

Le bucket reste privé. Pour résister à la compromission du compte Cloudflare, chiffrer en plus les dumps avec `age` avant envoi et conserver la clé hors de Cloudflare, par exemple sur le homelab et dans un gestionnaire de secrets séparé.

Ne pas déplacer les médias externes vers R2 tant que `canRehost` n'est pas vrai et que la licence ne le permet pas. R2 peut accueillir plus tard les actifs autorisés, pas les hotlinks actuels par défaut.

## 12. CI/CD proposée

Conserver un seul fournisseur d'orchestration visible : GitHub Actions.

### Pull request

1. installation verrouillée ;
2. génération Prisma ;
3. tests ;
4. typecheck ;
5. build Next/CLI ;
6. `prisma validate` ;
7. `git diff --check` ;
8. build vinext et `wrangler deploy --dry-run` ;
9. preview Worker connectée à une branche Neon de test anonymisée ou vide, jamais à PROD ;
10. smoke tests de lecture et vérification que les mutations anonymes répondent 401/403.

### Push sur `main`

1. attendre la CI verte ;
2. construire une version immuable du Worker avec commit SHA ;
3. déployer d'abord sur l'URL de staging ;
4. smoke tests ;
5. approbation de l'environnement GitHub `production` ;
6. promouvoir la version Worker, sans migration de schéma implicite ;
7. recette et surveillance ;
8. rollback Worker immédiat si nécessaire.

Cloudflare prend en charge les versions, previews et rollbacks. [GitHub Actions Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) et [rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

### Trois pipelines séparés

- **Code** : automatique après CI et approbation production ; ne possède aucun droit DDL.
- **Schéma** : `workflow_dispatch`, sauvegarde vérifiée, plan Prisma revu, approbation, `prisma migrate deploy` via `DIRECT_URL`, invariants après migration. Jamais de migration destructive automatique sur push.
- **Données/imports** : lancé manuellement depuis le homelab ou un runner dédié ; dry-run obligatoire, plan signé/hashé, garde-fous d'identité, compteurs et journal d'exécution. Il n'est jamais couplé au déploiement web.

## 13. Migration proposée, non exécutée

La base est petite et peu écrite. Un gel d'écriture de quelques minutes et un dump/restore sont plus sûrs qu'une réplication logique permanente.

### Répétition générale

1. Créer un projet Neon PostgreSQL 17 à Francfort et des rôles temporaires.
2. Exporter un snapshot homelab avec `pg_dump -Fc --no-owner --no-privileges`.
3. Calculer SHA-256 et conserver les compteurs/invariants source.
4. Restaurer dans une base/branche Neon vide ; ne pas précréer le schéma avec Prisma, puisque le dump contient schéma, données et `_prisma_migrations`.
5. Exécuter ensuite `prisma migrate status`, puis `prisma migrate deploy` seulement si le dépôt contient une migration plus récente que le dump.
6. Analyser les tables et vérifier contraintes, index, enums, séquences et invariants.
7. Déployer le Worker sur une URL temporaire, Hyperdrive cache désactivé.
8. Tester accueil, catalogue, recherche, thèmes, nouveautés, plusieurs fiches, collection, wishlist, mutations authentifiées et refus anonymes.
9. Mesurer TTFB chaud/froid, erreurs Worker, connexions, CPU, requêtes et réveil Neon.

### Bascule finale

1. Réduire à l'avance le TTL pertinent ou préparer la route Worker sans l'activer.
2. Vérifier un dump de secours récent du homelab et son test de lecture.
3. Activer un mode maintenance **écriture seulement** sur collection/wishlist ; la consultation peut rester ouverte.
4. Capturer les compteurs source et produire le dump final.
5. Calculer/valider SHA-256 ; restaurer dans une branche PROD propre.
6. Lancer `ANALYZE`, `prisma migrate status`, contraintes et invariants.
7. Tester l'URL temporaire contre PROD.
8. Basculer le domaine de Tunnel vers Worker.
9. Réactiver les écritures uniquement sur le domaine admin Cloudflare Access.
10. Surveiller au minimum 24 heures ; conserver homelab et Tunnel intacts.

Avec 18,4 MiB compressés, la copie doit être courte ; l'objectif raisonnable est un gel d'écriture de quelques minutes, à mesurer lors de la répétition.

## 14. Validation des données

Comparer avant/après :

- compte exact de chacune des 32 tables ;
- sommes `quantity` collection et nombres distincts collection/wishlist ;
- `Product`, `ProductVariant`, `SourceRecord`, `SourceValue`, `MediaAsset`, `Conflict`, `Theme` ;
- éventuelles futures tables ProductRange/ReleaseWave ;
- taux de NULL des références, noms, années, médias et clés étrangères importantes ;
- zéro relation orpheline pour chaque clé étrangère ;
- mêmes 63 index ou état attendu par les migrations ;
- mêmes enums et contraintes ;
- échantillon déterministe de 100 variantes triées par UUID avec références, thèmes, médias et statuts ;
- checksum logique par table sur les colonnes stables, par blocs triés par clé primaire, sans dépendre de l'ordre physique ni des timestamps volontairement modifiés.

Les contrôles doivent produire un rapport archivé avec le dump et le commit correspondant.

## 15. Retour arrière sans perte

Le rollback du **code** est immédiat via une version Worker précédente tant que le schéma reste compatible en arrière. Les migrations doivent suivre la méthode expand/contract : ajouter avant d'utiliser, migrer les données, retirer seulement dans une version ultérieure.

Le rollback de la **bascule** ne doit jamais simplement repointer vers l'ancien homelab après des écritures cloud : cela perdrait les nouvelles mutations. Procédure :

1. couper temporairement les écritures admin ;
2. si aucune écriture n'a eu lieu dans Neon, remettre la route Tunnel vers le homelab ;
3. sinon exporter Neon, vérifier les deltas collection/wishlist et restaurer/réconcilier ces données vers le homelab ;
4. valider les invariants sur le homelab ;
5. seulement ensuite repointer le domaine ;
6. garder Neon intact pour analyse.

Pendant la fenêtre de surveillance, le homelab est donc un secours figé, pas un second maître. Le journal de mutations et les compteurs avant/après rendent le retour vérifiable.

## 16. Conditions de feu vert

La bascule ne doit être autorisée que si :

- build vinext ou OpenNext réussi dans le vrai runtime Workers ;
- Prisma lit et écrit via Hyperdrive avec TLS ;
- transactions collection/wishlist réussies ;
- anonymes bloqués et JWT Access validés ;
- toutes les invariants DB passent ;
- cold start Neon et TTFB sont acceptables ;
- dump R2, checksum et restauration de test réussissent ;
- rollback Worker et procédure de retour homelab ont été répétés ;
- aucun crawler/import long ne fait partie du Worker ;
- le domaine public n'a toujours qu'une base maîtresse.

## Recommandation finale

**Choisir Cloudflare Workers Paid + Neon Launch + Hyperdrive.**

Cette combinaison est la plus cohérente avec le dépôt actuel : elle garde PostgreSQL 17 et les requêtes avancées, utilise le `pg` déjà présent, coûte probablement 6 à 9 USD/mois au niveau actuel, offre un PITR abordable et permet au homelab d'être éteint sans arrêter le site. Hyperdrive est préférable au pooler Neon pour ce Worker car il gère le pooling dans le réseau Cloudflare et permet de rapprocher l'exécution de Francfort.

**Option B : Cloudflare Workers Paid + Supabase Pro + Hyperdrive** si la priorité absolue devient l'absence de réveil de base et une facture fixe d'environ 30 USD/mois Workers compris. Le pooler Supabase seul reste viable avec placement à Francfort, mais Hyperdrive garde l'avantage pour les multiples requêtes séquentielles. Le PITR Supabase n'est pas économiquement adapté à ce petit projet.

Prochaine étape autorisée seulement après validation : créer une branche de migration, ajouter vinext/Workers et l'authentification Access, puis valider sur une copie Neon et une URL temporaire. La production, le DNS et le PostgreSQL local restent inchangés jusque-là.
