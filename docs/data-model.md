# Modèle de données

## Identité

- `products` représente le concept de base, par exemple `70733`.
- `product_variants` représente un objet collectionnable distinct (`70733v1`, marché, boîte, promotion ou réédition).
- `product_references` conserve les graphies et identifiants sous forme de chaînes.

Le parseur est volontairement conservateur : `70733v1` est reconnu comme variante de `70733`, mais `PM2305D` reste entier. Une lettre finale n'est jamais retirée sans convention explicite.

Les noms, traductions, thèmes, dates, format, dimensions, poids, âge, compteurs, médias, notices, figurines et pièces peuvent être portés par `ProductVariant`. Les tables au niveau `Product` restent disponibles pour la consolidation du concept de base. Une variante peut donc posséder un contenu ou un nom différent sans contaminer ses voisines.

Les références-placeholder (`0`, `0000`, `00000`) ne sont pas considérées uniques. Leur clé canonique est qualifiée par l'identité stable de la fiche source et une `ReviewTask` est ouverte.

## Provenance

`source_records` conserve l'identité externe, l'URL, le hash et éventuellement la charge brute. `source_values` conserve chaque affirmation champ par champ, sa valeur brute, sa valeur normalisée, sa confiance, sa priorité et sa date. `conflicts` relie les affirmations contradictoires ; `review_tasks` contient les cas ambigus.

La valeur canonique est recalculée par priorité de source sans perdre l'opinion d'une source. Les traductions utilisent des champs de provenance localisés (`name.fr`, `name.de`, etc.) afin de ne pas traiter deux langues comme une contradiction.

## Médias

`media_assets` et `instructions` ne supposent aucun droit de réhébergement. `can_rehost` et `can_display` sont tri-états : `NULL` signifie non vérifié, pas autorisé. L'URL source, l'auteur, le titulaire du copyright, la licence et la dernière vérification sont conservés.

## Évolutivité

Le schéma contient déjà les figures, pièces, marchés, thèmes, traductions, collections et wishlists. Ces tables ne justifient toutefois pas encore un import massif tant que leurs règles de correspondance ne sont pas validées.
