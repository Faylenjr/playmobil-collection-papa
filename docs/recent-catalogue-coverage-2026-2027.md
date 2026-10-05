# Couverture du catalogue récent 2026–2027

Audit observé le 5 octobre 2026. Koupobol est utilisé uniquement comme radar de découverte. Les données canoniques et les prix ne sont retenus que lorsqu'une page PLAYMOBIL officielle confirme exactement la référence.

## Périmètre et reproductibilité

- Snapshot Koupobol : une page annuelle 2026, une page annuelle 2027 et la page des 50 derniers ajouts.
- `robots.txt` Koupobol observé : seul `/go/` est interdit ; aucun chemin interdit n'a été consulté.
- Aucun descriptif ni média Koupobol n'est copié. Les snapshots conservent référence, nom court, thème, mois annoncé et URL.
- Snapshot officiel : pages produit directes FR, DE et US pour les seuls candidats absents et les 43 références des vagues déjà auditées.
- Le script `pnpm catalogue:audit-recent` recalcule les métriques DB depuis les snapshots committés, sans accès réseau.
- La régénération réseau est une action explicite : `pnpm catalogue:snapshot-recent` puis `pnpm catalogue:snapshot-official-recent`.

## Définitions du différentiel

- `PRESENT_EXACT` : la base et une référence non suffixée existent localement pour l'année annoncée.
- `PRESENT_OTHER_VARIANT` : la base existe pour l'année, mais uniquement sous variante marché ou variante interne.
- `PRESENT_DIFFERENT_YEAR` : la base existe, mais pas avec l'année annoncée par Koupobol.
- `MISSING_LOCAL` : aucune référence locale ne possède cette base.
- `AMBIGUOUS` : la base correspond à plusieurs produits ou à une identité ambiguë.
- `INVALID_OR_NON_PRODUCT` : entrée sans référence exploitable ; les produits non-set restent toutefois comptés comme présents et sont analysés séparément.

Une référence commerciale collectionneur suit la règle structurée existante : identité `ASSIGNED` ou `REUSED`, base numérique historique de 3–4 chiffres ou moderne 70000–72999, et exclusion des pièces, catalogues, merchandising, promotions, magazines, porte-clés et décorations. Ce chiffre est volontairement plus strict que « toutes les références ayant une page produit ».

## DB locale

| Année | Products (`products.release_year`) | Products via variants | Variants | Références commerciales distinctes |
| ---: | ---: | ---: | ---: | ---: |
| 2025 | 316 | 317 | 361 | 194 |
| 2026 | 318 | 318 | 388 | 223 |
| 2027 | 1 | 1 | 1 | 1 |

Répartition 2026 : 269 variants `SET`, 57 `FIGURE`, 36 `PROMOTIONAL_ITEM`, 20 `MERCHANDISE` et 6 `CATALOGUE`. Identités : 357 `ASSIGNED`, 7 `REUSED`, 15 `AMBIGUOUS`, 9 `PLACEHOLDER`.

Le chiffre honnête selon la règle actuelle est donc **223 références commerciales PLAYMOBIL distinctes connues pour 2026**. Sept références Koupobol présentes exactement (`72006`, `72081`, `72082`, `72120`, `72121`, `72164`, `72195`) semblent être de vraies boîtes mais sont classées `MERCHANDISE` dans la source locale ; elles restent visibles et sont signalées comme dette de qualité, sans correction automatique.

## Koupobol 2026

Corpus observé : **221 références**.

| Statut | Nombre |
| --- | ---: |
| `PRESENT_EXACT` | 185 |
| `PRESENT_OTHER_VARIANT` | 19 |
| `PRESENT_DIFFERENT_YEAR` | 5 |
| `MISSING_LOCAL` | 12 |
| `AMBIGUOUS` | 0 |
| `INVALID_OR_NON_PRODUCT` | 0 |

Les 19 autres variantes comprennent les 24 figurines internes des boîtes 72027/72028, les joueurs allemands 72254–72268, le starter Bundesliga 72279 et les variantes mexicaines 72346. Elles ne représentent pas 19 nouveaux produits absents.

Les cinq divergences d'année sont `7213` (année locale inconnue), `71714` (local 2024), `72135` (local 2024), `72172` (local 2025) et `72226` (local 2027). Elles restent des conflits de marché/source, pas des corrections automatiques.

### Absences 2026

| Réf. | Nom découverte | EAN observé chez Koupobol | Vérification PLAYMOBIL |
| --- | --- | --- | --- |
| 71520 | Volkswagen T1 Camping Bus jaune | 4008789715203 | non confirmée FR/DE/US |
| 72216 | Calèche des licornes | 4008789722164 | confirmée FR et DE |
| 72220 | Boule de Noël : sportif | 4008789722201 | confirmée FR, DE et US |
| 72221 | Boule de Noël : skater | 4008789722218 | confirmée DE |
| 72222 | Boule de Noël : menuisier | 4008789722225 | confirmée FR, DE et US |
| 72224 | Boule de Noël : Père Noël | 4008789722249 | confirmée FR, DE et US |
| 72240 | Tapis de jeu Junior | non publié | non confirmée FR/DE/US |
| 72269 | Starter Kit XXL | non publié | confirmée FR, DE et US |
| 72365 | PLAYMOBIL Hi! Équestre, kit prêt à jouer | 4008789723659 | confirmée DE |
| 72366 | PLAYMOBIL Hi! Pirates, kit prêt à jouer | 4008789723666 | confirmée DE |
| 72367 | PLAYMOBIL Hi! Police, kit prêt à jouer | 4008789723673 | confirmée DE |
| 72368 | PLAYMOBIL Hi! Zoo, kit prêt à jouer | 4008789723680 | confirmée DE |

Bilan : **10 confirmées officiellement**, 2 candidates Koupobol seulement. Les dix confirmées ne sont pas encore injectées : le pipeline actuel n'a pas de création officielle isolée garantissant toutes les identités, traductions, thèmes et variantes. Une table GTIN dédiée serait préférable avant de conserver les EAN ; aucun champ existant n'a été détourné.

## Koupobol 2027

Corpus observé : **46 références**, toutes absentes localement. Aucune page produit officielle FR, DE ou US n'a confirmé ces références le 5 octobre 2026.

- `CONFIRMED_OFFICIAL` : 0
- `ANNOUNCED_MULTI_SOURCE` : 44
- `KOUP0BOL_ONLY_CANDIDATE` : 0 sur ce corpus après contre-vérification communautaire
- `CONFLICTING` : 2 (`72299`, `72300`, annoncées 2027 par Koupobol mais 2026 par El Mundo Click)

Les 44 concordances multi-source restent des candidats : deux sources communautaires concordantes ne remplacent pas une publication officielle. Aucun produit 2027 n'est importé.

## Cinquante derniers ajouts

- 50 observés ;
- 3 déjà présents localement ;
- 47 absents ;
- parmi les absents, 46 sont le corpus 2027 non confirmé et 1 (`72216`) est confirmé officiellement.

Cette page est un bon radar, mais pas un flux d'import : elle mélange vraies nouveautés, variantes et ajouts tardifs d'anciens produits. Une veille hebdomadaire, limitée à cette page et aux pages annuelles, serait raisonnable tant que `robots.txt` reste compatible. Elle devrait uniquement produire une liste de candidats à valider.

## Vagues officielles 2026

- 43 références dans 5 vagues déjà modélisées ;
- 29 de ces 43 apparaissent aussi sur la page Koupobol 2026 ;
- les 43 ne représentent que 19,3 % des 223 références commerciales locales 2026 ;
- 180 références commerciales locales 2026 sont hors de ces cinq vagues.

Les recherches officielles ciblées n'ont pas retrouvé de page éditoriale PLAYMOBIL reproductible équivalente pour juin à septembre. Les articles mensuels Koupobol ne suffisent pas à créer des `ReleaseWave`, donc aucune vague supplémentaire n'est créée.

## Prix officiels

Le JSON-LD des pages PLAYMOBIL expose un prix et une devise par marché. Le snapshot contient 47 prix FR, 50 prix DE et 41 prix US sur l'ensemble des références vérifiées. Pour les produits déjà présents et à cible variant unique, le plan sûr retient :

- 78 `ListPriceObservation` ;
- 41 références locales ;
- 40 prix France ;
- 38 prix Allemagne ;
- 72027 et 72028 exclues, car leur prix concerne la boîte commerciale et le modèle actuel ne permet pas de le rattacher proprement à un variant interne.

Ces valeurs sont décrites dans l'interface comme prix officiel/conseillé observé sur la boutique PLAYMOBIL à la date du snapshot. Elles ne sont jamais comparées entre marchés et ne créent aucune promotion en l'absence d'une offre suivie.

## Recommandation

Koupobol est effectivement en avance pour la veille 2027, mais sa valeur est la détection, pas la canonicalisation. Recommandation : contrôle **hebdomadaire**, sans import automatique, avec snapshot, diff et file de candidats. La prochaine étape catalogue doit créer un pipeline officiel isolé et éventuellement un modèle `ProductIdentifier` avant l'ajout des dix références 2026 et de leurs EAN.
