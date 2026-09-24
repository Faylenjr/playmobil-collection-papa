# Modèle de données

## Identité

- `products` représente le concept de base, par exemple `70733`.
- `product_variants` représente un objet collectionnable distinct (`70733v1`, marché, boîte, promotion ou réédition).
- `product_references` conserve les graphies et identifiants sous forme de chaînes.

Le parseur est volontairement conservateur : `70733v1` est reconnu comme variante de `70733`, mais `PM2305D` reste entier. Une lettre finale n'est jamais retirée sans convention explicite.

Les noms, traductions, thèmes, dates, format, dimensions, poids, âge, compteurs, médias, notices, figurines et pièces peuvent être portés par `ProductVariant`. Les tables au niveau `Product` restent disponibles pour la consolidation du concept de base. Une variante peut donc posséder un contenu ou un nom différent sans contaminer ses voisines.

Chaque `ProductReference` porte une classe d'identité :

- `ASSIGNED` : référence attribuée à un objet sans collision connue ;
- `PLACEHOLDER` : valeur générique (`0`, `0000`, `00000`, `N/A` et variantes de marché/version strictement reconnues) ;
- `REUSED` : même référence publiée pour plusieurs objets dont les signaux distinctifs sont suffisants ;
- `AMBIGUOUS` : collision que les données disponibles ne permettent pas de trancher sûrement.

Les placeholders et les réutilisations restent des objets séparés avec une clé qualifiée. Pour un variant représenté par plusieurs sources, l'ancrage est choisi de façon déterministe dans l'ensemble de ses couples `(source, externalId)` ; il ne dépend donc ni de la première source importée ni de l'ordre du crawl. Lorsqu'une référence jusque-là unique devient `REUSED`, les clés de tous les objets du groupe sont requalifiées atomiquement. Ils ne créent pas de revue humaine ouverte. Une seule `ReviewTask` active est conservée par groupe `AMBIGUOUS`. La détection des placeholders est ancrée sur toute la référence : une référence légitime comme `0001` ou `0104-sch` n'est donc pas capturée.

## Provenance

`source_records` conserve l'identité externe, l'URL, le hash, éventuellement la charge brute et un lien explicite vers la variante importée. Ce lien rend les réimports idempotents même si le nom, l'année ou le thème source change. `source_values` conserve chaque affirmation champ par champ, sa valeur brute, sa valeur normalisée, sa confiance, sa priorité et sa date. `conflicts` relie les affirmations contradictoires ; `review_tasks` contient les cas réellement ambigus.

La valeur canonique est recalculée par priorité de source sans perdre l'opinion d'une source. Les traductions utilisent des champs de provenance localisés (`name.fr`, `name.de`, etc.) afin de ne pas traiter deux langues comme une contradiction.

## Médias

`media_assets` et `instructions` ne supposent aucun droit de réhébergement. `can_rehost` et `can_display` sont tri-états : `NULL` signifie non vérifié, pas autorisé. L'URL source, l'auteur, le titulaire du copyright, la licence et la dernière vérification sont conservés.

`source_media_observations` est la couche de provenance many-to-many en amont des assets
canoniques. Une ligne affirme uniquement qu'un `SourceRecord` a effectivement référencé une URL
avec un type donné, à une date donnée et depuis un contenu de page identifié par hash. Plusieurs
fiches peuvent observer la même URL. Cette table ne déclare jamais à elle seule qu'un média
appartient exclusivement à une variante et aucun backfill n'est déduit des relations historiques.

## Évolutivité

Le schéma contient déjà les figures, pièces, marchés, thèmes, traductions, collections et wishlists. Ces tables ne justifient toutefois pas encore un import massif tant que leurs règles de correspondance ne sont pas validées.
