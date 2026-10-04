# Découverte collectionneur : vagues, catégories et marchés

## État audité avant migration

- 14 397 variantes ; 25 marchés documentés dans `VariantMarket`.
- aucun `listPrice` renseigné et aucune devise de prix catalogue : la couverture initiale des prix conseillés est donc de 0 % ;
- la seule source actuellement importée est Klickypedia (14 466 enregistrements source) ;
- l'audit officiel 2026 fournit 5 vagues, 43 références uniques, 11 gammes/séries et 36 appartenances ; les 43 références correspondent chacune à un seul `Product` local ;
- les références 72027 et 72028 comportent plusieurs variantes internes : l'association commerciale cible le `Product`, jamais une figurine arbitraire.

## Modèle

`ProductRange` et `RangeMembership` décrivent une gamme durable ou une série explicitement revendiquée par une source. `ReleaseWave` et `ReleaseWaveItem` décrivent une campagne/période officielle ; leur relation cible `Product`. Les deux notions restent séparées de `Theme`.

`CollectorCategory` et `VariantCategoryMembership` servent aux regroupements transversaux. Une variante peut donc simultanément appartenir à un thème, une gamme, une vague, une catégorie spéciale et un marché.

## Géants / XXL

Les mots *giant*, *large* ou *XXL* seuls produisent des faux positifs (animaux géants, sacs, calendriers). La règle v1 exige donc les deux preuves structurées suivantes :

1. `format = Decoration toy` ;
2. l'appellation `XXL` comme mot entier dans le nom de la variante ou du produit.

Cette règle identifie 42 variantes. Elle est versionnée `xxl-decoration-v1` et chaque appartenance conserve sa preuve et sa provenance. Aucune autre catégorie n'est créée artificiellement dans cette phase.

## Marchés et exclusivités

La présence d'un suffixe ou d'un lien `VariantMarket` n'est jamais une preuve d'exclusivité.

- `ATTESTED_EXCLUSIVE` : le payload source contient une revendication explicite d'exclusivité (par exemple une enseigne nommée) ;
- `MARKET_EDITION` : variante structurée de type `MARKET`, sans revendication suffisante d'exclusivité ;
- `PRESENCE` : simple présence/documentation pour le marché.

Les données existantes couvrent 25 marchés. Avant normalisation, les principaux volumes observés étaient : Allemagne 1 930 liens, États-Unis 597, Espagne 547 et France 177. Ces nombres décrivent le corpus source, pas une vérité commerciale exhaustive. Les pages affichent honnêtement chaque niveau de preuve.

## Prix

Le schéma sépare les offres courantes de leur historique append-only. Les prix catalogue sont des observations datées par marché/source ; le champ historique global reste en place mais n'est pas utilisé pour inventer une promotion. Une remise exige une offre neuve ou scellée, fraîche, de même devise et de même marché qu'un prix catalogue fiable.

Leboncoin et Dealabs restent des recherches manuelles. L'adaptateur eBay est désactivé sans identifiants et rejette tout rattachement où la référence exacte n'est pas isolée dans le titre.
