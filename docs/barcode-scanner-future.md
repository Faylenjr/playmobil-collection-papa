# Scanner de code-barres — workflow futur

Le scanner ne sera activé que lorsque la couverture EAN/GTIN de `ProductIdentifier` sera suffisante.

Workflow prévu : caméra → lecture EAN → correspondance exacte `ProductIdentifier` → fiche du produit → ajout explicite à la collection. Une absence ou une collision d’identifiant doit mener à une recherche/revue, jamais à un ajout automatique.
