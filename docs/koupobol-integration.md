# Intégration Koupobol

État au 7 octobre 2026 : Koupobol reste un radar et une destination de lien,
jamais une source d'offres ingérée automatiquement.

## Constat

Koupobol est spécialisé PLAYMOBIL et expose publiquement nouveautés, fiches,
EAN et comparaisons de marchands. Aucune API, aucun export ni feed partenaire
public n'a été identifié. Les conditions d'utilisation interdisent la
reproduction ou diffusion sans accord préalable. Le projet n'appelle donc
aucun endpoint privé et ne copie ni prix, ni descriptions, ni images.

Les fiches déjà connues par provenance peuvent recevoir un lien « Voir les prix
sur Koupobol ». Sans URL de fiche vérifiée, aucun lien n'est inventé.

Contacts publics : formulaire « Nous contacter » et `contact@lexiweb.fr`.

## Demande de partenariat proposée (non envoyée)

Objet : demande d'accès API ou feed Koupobol pour un projet privé de collection

Bonjour,

Je développe un outil privé de gestion de collection PLAYMOBIL utilisé par un
collectionneur. Nous aimerions pouvoir afficher, avec attribution claire à
Koupobol, quelques meilleures offres françaises et renvoyer les visiteurs vers
vos fiches ou liens trackés.

Disposez-vous d'une API, d'un feed, d'un export partenaire ou d'un programme
d'affiliation autorisant cet usage ? Les champs qui nous seraient utiles sont :
référence PLAYMOBIL, EAN/GTIN, prix, marchand, frais de port, URL d'offre et date
de mise à jour. Nous respecterions vos quotas, vos règles d'affichage et
n'effectuerions aucun scraping sans votre accord.

Merci d'avance pour les modalités techniques et commerciales éventuelles.

## Suite autorisée

Après accord écrit : documenter précisément les champs, quotas, attribution,
durée de conservation et liens affiliés ; implémenter un adaptateur vers les
tables communes `Retailer`, `Offer` et `PriceObservation`. Sans accord : rester
sur les liens manuels et le radar contrôlé.
