# Modèle de données

## Identité

- `products` représente le concept de base, par exemple `70733`.
- `product_variants` représente un objet collectionnable distinct (`70733v1`, marché, boîte, promotion ou réédition).
- `product_references` conserve les graphies et identifiants sous forme de chaînes.

Le parseur est volontairement conservateur : `70733v1` est reconnu comme variante de `70733`, mais `PM2305D` reste entier. Une lettre finale n'est jamais retirée sans convention explicite.

## Provenance

`source_records` conserve l'identité externe, l'URL, le hash et éventuellement la charge brute. `source_values` conserve chaque affirmation champ par champ, sa valeur brute, sa valeur normalisée, sa confiance, sa priorité et sa date. `conflicts` relie les affirmations contradictoires ; `review_tasks` contient les cas ambigus.

La valeur canonique peut donc être recalculée sans perdre l'opinion d'une source.

## Médias

`media_assets` et `instructions` ne supposent aucun droit de réhébergement. `can_rehost` et `can_display` sont tri-états : `NULL` signifie non vérifié, pas autorisé. L'URL source, l'auteur, le titulaire du copyright, la licence et la dernière vérification sont conservés.

## Évolutivité

Le schéma contient déjà les figures, pièces, marchés, thèmes, traductions, collections et wishlists. Ces tables ne justifient toutefois pas encore un import massif tant que leurs règles de correspondance ne sont pas validées.
