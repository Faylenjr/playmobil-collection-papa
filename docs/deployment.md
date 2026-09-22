# Déploiement

## Développement

`docker compose up` lance PostgreSQL et applique la migration. L'environnement d'exécution utilisé pour cette phase ne fournit pas Docker ; le Compose est donc validé statiquement, tandis que Prisma, les tests et la compilation sont exécutés directement.

## Cible recommandée

- application Next.js sur Cloudflare Workers avec l'adaptateur officiellement supporté au moment du MVP ;
- PostgreSQL managé (Neon est un bon candidat) ;
- accès Workers via Cloudflare Hyperdrive et `pg` ;
- workers d'import longs exécutés hors requête web (GitHub Actions planifiées ou service de jobs) ;
- migrations dans une étape CI unique utilisant une connexion directe.

Cloudflare recommande actuellement `pg` avec Hyperdrive. Il ne faut pas forcer Prisma Client dans le runtime edge si cela dégrade la compatibilité : Prisma peut rester l'outil de schéma/migration et les Workers utiliser `pg`.

## CI/CD prévue

1. installation verrouillée ;
2. génération Prisma ;
3. tests, typecheck et build ;
4. migration contrôlée ;
5. déploiement production sur branche protégée.

Aucun domaine, compte cloud ou secret n'est créé par ce dépôt. Les secrets restent dans le gestionnaire du fournisseur et ne sont jamais commités.
