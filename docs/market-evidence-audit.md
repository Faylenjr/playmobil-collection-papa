# Audit des compteurs pays

Audit effectué le 6 octobre 2026 sur la base homelab déployée au commit `7e48936`.

## Conclusion

Les compteurs élevés ne venaient ni de doublons de preuves, ni de plusieurs sources comptées pour un même objet. La contrainte `@@unique([variantId, marketId, kind])` faisait correspondre chaque ligne à une variante distincte, et les variantes concernées appartiennent chacune à un produit distinct.

Le défaut était sémantique : le champ communautaire Klickypedia `exclusive` décrit surtout un canal, un partenaire ou une opération commerciale (`Playmobil Magazin`, `Kaufland`, `BVG`, `Karstadt`, etc.). Il ne dit pas que l'objet était exclusivement destiné au pays indiqué par la variante.

Avant correction :

- 5 072 relations `MarketEvidence` ;
- 831 `PRESENCE` ;
- 1 774 `MARKET_EDITION` ;
- 2 467 `ATTESTED_EXCLUSIVE` ;
- aucune paire variante/marché associée à plusieurs types ;
- pour chaque ligne du tableau initial, preuves brutes = variantes distinctes = produits distincts.

La règle corrigée réserve `ATTESTED_EXCLUSIVE` à une affirmation structurée et spécifique au marché, par exemple `marketExclusive: { marketCode: "GERMANY", statement: "Germany only" }`. Le champ historique `exclusive: "Kaufland"` est conservé comme contexte commercial, mais ne prouve plus une exclusivité géographique.

## Échantillon allemand

Un échantillon déterministe de 50 anciennes relations `ATTESTED_EXCLUSIVE` allemandes a été contrôlé :

- source : 50/50 Klickypedia ;
- 49 variantes `MARKET`, 1 variante `PROMOTION` ;
- 50/50 possèdent un canal ou partenaire dans le champ `exclusive` ;
- 0/50 contiennent une affirmation géographique du type `Germany only`, `German exclusive` ou équivalent ;
- 50/50 doivent donc être reclassées en `MARKET_EDITION`.

Exemples de faux positifs :

| Référence | Nom | Valeur communautaire `exclusive` | Pourquoi ce n'est pas une exclusivité Allemagne |
| --- | --- | --- | --- |
| `71390-ger` | Shopper on bicycle | Kaufland | Enseigne commerciale, aucune limitation géographique attestée |
| `30794404-ger` | Peter Venkman | Playmobil Magazin Ghostbusters | Canal magazine, pas une affirmation `Germany only` |
| `70720-ger` | Postwoman | Cruz Roja | Partenaire espagnol incohérent avec une exclusivité allemande |
| `30796344-ger` | Scary Skeleton Knight | Playmobil Magazin Novelmore | Canal magazine |
| `72259-ger` | Nico Schlotterbeck | DFB Stars | Collection/partenaire, pas une preuve de territoire exclusif |
| `4060-ger` | Pony Ranch | Idee & Spiel | Distributeur commercial |
| `11608-ger` | Puzzle Farm with 150 pieces | Ravensburger | Fabricant/partenaire |

Le script `pnpm markets:audit` reproduit les métriques complètes et expose les 50 lignes avec référence, nom, source, URL, preuve enregistrée, valeur brute et classification proposée.

## Compteurs avant correction

Les marchés principaux affichés par l'interface étaient :

| Marché | Type | Preuves brutes | Variantes distinctes | Produits distincts |
| --- | --- | ---: | ---: | ---: |
| Allemagne | PRESENCE | 72 | 72 | 72 |
| Allemagne | MARKET_EDITION | 318 | 318 | 318 |
| Allemagne | ATTESTED_EXCLUSIVE | 1 540 | 1 540 | 1 540 |
| France | PRESENCE | 6 | 6 | 6 |
| France | MARKET_EDITION | 15 | 15 | 15 |
| France | ATTESTED_EXCLUSIVE | 156 | 156 | 156 |
| Espagne Playmobil | PRESENCE | 84 | 84 | 84 |
| Espagne Playmobil | MARKET_EDITION | 149 | 149 | 149 |
| Espagne Playmobil | ATTESTED_EXCLUSIVE | 314 | 314 | 314 |
| Italie | PRESENCE | 8 | 8 | 8 |
| Italie | MARKET_EDITION | 43 | 43 | 43 |
| Italie | ATTESTED_EXCLUSIVE | 22 | 22 | 22 |
| Royaume-Uni Playmobil | PRESENCE | 0 | 0 | 0 |
| Royaume-Uni Playmobil | MARKET_EDITION | 9 | 9 | 9 |
| Royaume-Uni Playmobil | ATTESTED_EXCLUSIVE | 13 | 13 | 13 |
| USA Playmobil | PRESENCE | 33 | 33 | 33 |
| USA Playmobil | MARKET_EDITION | 425 | 425 | 425 |
| USA Playmobil | ATTESTED_EXCLUSIVE | 139 | 139 | 139 |

## Reclassification proposée

Sur les 2 467 anciennes exclusivités :

- 2 466 deviennent `MARKET_EDITION` car la variante est structurée `MARKET`, `EDITION`, `EXCLUSIVE` ou `PROMOTION` ;
- 1 devient `PRESENCE` car la variante est `STANDARD` ;
- 0 reste `ATTESTED_EXCLUSIVE`, faute d'une preuve géographique explicite dans le corpus actuel.

Compteurs principaux après correction :

| Marché | Présences | Éditions locales | Exclusivités attestées |
| --- | ---: | ---: | ---: |
| Allemagne | 72 | 1 858 | 0 |
| France | 6 | 171 | 0 |
| Espagne Playmobil | 84 | 463 | 0 |
| Italie | 8 | 65 | 0 |
| Royaume-Uni Playmobil | 0 | 22 | 0 |
| USA Playmobil | 33 | 564 | 0 |

Une valeur nulle est volontaire et honnête : le corpus connaît de nombreuses éditions ou opérations locales, mais ne contient actuellement aucune preuve structurée suffisante pour affirmer une exclusivité territoriale.

## Interface

Les pages `/pays` et `/pays/[code]` comptent explicitement les `variantId` distincts. Le détail d'un objet peut continuer à conserver et afficher sa provenance. L'étiquette « exclusivité attestée » n'est utilisée que pour `ATTESTED_EXCLUSIVE` selon la nouvelle règle.
