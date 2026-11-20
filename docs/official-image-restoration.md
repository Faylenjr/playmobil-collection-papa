# Rétablissement des images officielles

Le lot du 20 novembre 2026 contient 98 candidats et une image par variante dans
[reviewed-official-images.json](../data/audit/reviewed-official-images.json). Il
réunit les 35 correspondances des deux audits, 54 références supplémentaires issues
des relevés officiels existants et 9 issues d’un lot de 16 objets possédés.
Les 54 liens du lot d’archives et les 9 nouveaux liens ont répondu en image
lors du contrôle. La fiche source, la page où le visuel a été relevé et la date de
constat restent séparées. Pour les fiches `indexed_only`, la fiche directe a
répondu 404 et une observation indexée de Playmobil établit la provenance.

Le sélecteur utilise l’identifiant de variante, sa référence primaire ASSIGNED
et son type actuel. Il ne choisit aucun visuel sur une simple référence de base.
Les `MediaAsset` historiques restent utilisables quand `canDisplay` vaut
`true` ou `null` et que la source est admissible. `false` exclut toujours
le visuel. Le manifeste complète ces médias en lecture seule et
préserve toutes les URL historiques. Aucun import ni migration ne sont requis.

## Affichage et retour arrière

- `PLAYMOBIL_DISABLED_MEDIA_SOURCES` accepte des clés de source ou noms d’hôte
  séparés par des virgules. La valeur vide par défaut conserve les sources.
  Ajouter `playmobil-official` pour suspendre tous les visuels officiels.
- `PLAYMOBIL_REVIEWED_IMAGES_ENABLED` active le nouveau lot à `1`. Repasser à
  `0` et redémarrer le Web pour le retirer sans rebuild ni écriture en base.
  La valeur par défaut est `0`. Les droits d’utilisation se vérifient
  séparément avant l’activation.
- `PLAYMOBIL_OFFICIAL_MEDIA_PREVIEW=1` active le lot en développement avec une
  base PGlite de recette. Lancer le serveur sur `127.0.0.1` uniquement.

Les images personnelles exactes marquées affichables prennent la priorité
(`Source.key = collector-personal`). Viennent ensuite les visuels officiels,
puis les autres images admissibles et enfin Klickypedia. Chaque URL est tentée au
plus une fois par liste de candidats. Si elles échouent toutes, la fiche affiche
« Image indisponible ». Le navigateur charge l’URL directement.

Les [règles Playmobil pour les sites de fans](https://www.playmobil.com/fr-fr/content/p_guidelines/P_GUIDELINES.html)
encadrent l’usage des visuels et ses [mentions légales](https://www.playmobil.com/fr-fr/content/gesetzhinweis/GESETZHINWEIS.html)
restreignent leur usage sur d’autres sites. L’accès familial sous Cloudflare
Access, une réponse HTTP 200 et une valeur interne `canDisplay` ne documentent
pas une autorisation du titulaire.
