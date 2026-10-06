# Intégration Koupobol

Audit mis à jour le 6 octobre 2026.

## Décision

Koupobol reste un radar de découverte, jamais une source canonique. Aucun prix,
texte, image ou fiche Koupobol n'est importé automatiquement dans le catalogue.
Les références détectées alimentent uniquement `ExternalCandidate`; leur passage
au catalogue exige une confirmation officielle ou une validation explicite.

Les [conditions générales](https://www.koupobol.com/pages/conditions-generales-d-utilisation/4)
réservent la reproduction, la diffusion, la commercialisation et la modification
des éléments du site à l'accord préalable de Lexiweb. L'audit public n'a identifié
ni API, ni flux XML/JSON, ni export documenté. Il n'est donc pas justifié de mettre
en place un scraping périodique.

## Ce qui est utile

- référence commerciale et titre observé pour détecter un candidat ;
- année ou période annoncée comme indice, jamais comme valeur canonique ;
- EAN observé pour préparer une vérification par une autre source ;
- URL de fiche comme trace de découverte ;
- informations de prix et de marchands uniquement après accord ou flux autorisé.

La page de présentation de Koupobol indique que le service appartient à Lexiweb,
agrège des partenaires marchands français et utilise des plateformes d'affiliation :
[présentation et contact](https://www.koupobol.com/pages/koupobol-comparateur-de-prix-playmobil/2).

## Fonctionnement retenu

1. Un snapshot contrôlé, acquis manuellement, peut être comparé par
   `pnpm catalogue:radar-diff`.
2. Le diff produit des candidats, des changements de nom ou d'année et des
   conflits ; il ne crée aucun `Product`.
3. Une fiche produit n'affiche « Voir les prix sur Koupobol » que si une URL de
   fiche HTTPS déjà observée est connue. La recherche Koupobol utilise un formulaire
   POST et ne fournit pas d'URL de recherche publique stable : aucune URL n'est
   fabriquée.
4. `71520` et `72240` restent `DISCOVERED` tant qu'une preuve indépendante fiable
   n'est pas disponible.

## Automatisation possible

Une veille hebdomadaire légère ne sera activée qu'après accord écrit de Lexiweb ou
mise à disposition d'une API/flux. Elle devra limiter les pages consultées, annoncer
un user-agent explicite, respecter la cadence convenue et produire uniquement un
rapport de candidats. Sans cet accord, le mode reste manuel.

## Demande à adresser à Lexiweb

Le contact doit préciser qu'il s'agit d'un catalogue familial non commercial et
demander :

- l'existence d'une API, d'un flux affilié ou d'un export autorisé ;
- les champs disponibles (référence, EAN, marchand, prix, port, disponibilité) ;
- la cadence, les quotas et la durée de conservation autorisés ;
- les obligations d'attribution et de lien affilié ;
- l'autorisation éventuelle d'un radar hebdomadaire sans copie de contenu.

## Compatibilité future

Les EAN autorisés pourront alimenter `ProductIdentifier` avec leur provenance.
Les offres autorisées seront rattachées à `Retailer` / `Offer`, puis historisées
dans `PriceObservation`. Elles ne remplaceront jamais les prix officiels stockés
par marché dans `ListPriceObservation`.
