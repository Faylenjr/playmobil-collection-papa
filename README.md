# Playmobil Collection

Catalogue non commercial, traçable et reproductible destiné aux collectionneurs PLAYMOBIL. La phase actuelle construit le socle de données avant l'interface utilisateur.

## État actuel

- PostgreSQL + Prisma 7 ;
- distinction `Product` / `ProductVariant` / `ProductReference` ;
- provenance champ par champ, conflits et file de revue ;
- importeurs réels et reprenables pour Klickypedia et l'enrichissement PLAYMOBIL DE/FR ;
- audit respectueux de `robots.txt`, avec délais, timeouts et retries ;
- rapport de couverture calculé depuis la base ;
- 22 tests automatisés ;
- échantillon mesuré : 200 fiches Klickypedia, 0 erreur, 192 références distinctes, 197 produits et 200 objets collectionnables.

L'audit du 22 septembre 2026 mesure 14 467 URL de fiches réparties sur 15 sitemaps `sets` de Klickypedia. Ce nombre n'est **pas** présenté comme un nombre de références uniques. Voir [`docs/phase-0-report.md`](docs/phase-0-report.md).

## Démarrage local

Prérequis : Docker avec Compose, ou Node.js 22+ et PostgreSQL 16+.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm test
```

Audit non destructif des sources :

```bash
pnpm source:audit
```

Rapport de couverture de la base :

```bash
pnpm report
```

Sans daemon PostgreSQL local, le fallback de validation PGlite (PostgreSQL WASM) est disponible :

```bash
PGLITE_DIR=./.data/pglite pnpm import:klickypedia:sample:embedded
PGLITE_DIR=./.data/pglite pnpm report:embedded
```

`docker compose up` lance PostgreSQL puis applique le schéma. Le conteneur d'application est volontairement un worker ponctuel pendant la phase données ; le service web sera ajouté quand le seuil qualité du catalogue sera atteint.

## Règles de collecte

- aucune référence n'est convertie en entier ;
- `NULL` est préféré à une valeur devinée ;
- aucune source n'écrase silencieusement une autre ;
- aucune image n'est téléchargée en masse ; seules les URL et métadonnées juridiques sont stockées ;
- les chemins interdits par `robots.txt` ne sont pas utilisés ;
- un import complet n'est lancé qu'après validation de fixtures représentatives.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm test` | Tests unitaires hors réseau |
| `pnpm typecheck` | Vérification TypeScript stricte |
| `pnpm build` | Compilation du worker |
| `pnpm source:audit` | Audit live des robots/sitemaps et métriques accessibles |
| `pnpm import:klickypedia:index` | Indexe les URL publiques des sitemaps, sans aspirer les fiches |
| `pnpm import:klickypedia:sample` | Importe/reprend le lot représentatif de 200 fiches |
| `pnpm import:klickypedia:full` | Importe/reprend les 14 466 fiches publiques à cadence prudente |
| `pnpm import:playmobil -- --limit=20` | Enrichit les références connues depuis PLAYMOBIL DE/FR |
| `pnpm report` | Calcule la couverture réelle de PostgreSQL |

## Documentation

- [Architecture](docs/architecture.md)
- [Sources](docs/data-sources.md)
- [Modèle de données](docs/data-model.md)
- [Processus d'import](docs/import-process.md)
- [Droit et licences](docs/legal-and-licensing.md)
- [Qualité](docs/data-quality.md)
- [Déploiement](docs/deployment.md)
- [Rapport de phase 0](docs/phase-0-report.md)
