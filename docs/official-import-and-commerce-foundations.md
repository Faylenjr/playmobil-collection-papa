# Fondations d'import officiel, identifiants et commerce

Audit et implémentation du 5 octobre 2026. Ce document complète `recent-catalogue-coverage-2026-2027.md`.

## ProductIdentifier

`ProductIdentifier` conserve une observation sourcée, pas une valeur globale écrasable. Il accepte `EAN`, `GTIN`, `UPC`, `MPN` et `OFFICIAL_SKU`, avec valeur brute, valeur normalisée, source, `SourceRecord` lorsque disponible, URL, marché, première/dernière observation et niveau de confiance. Une contrainte SQL impose exactement une cible : `Product` ou `ProductVariant`. La clé d'observation déterministe empêche la duplication d'un même constat, tandis que l'index `(type, normalizedValue)` permet de détecter les collisions entre produits sans supprimer les observations contradictoires.

Audit avant migration :

- `SourceValue` : 0 champ EAN/GTIN/UPC/MPN/SKU/barcode ;
- payloads `SourceRecord` historiques : 0 enregistrement contenant un tel champ ;
- échantillon contrôlé Koupobol des 12 absences 2026 : 10 EAN valides, conservés uniquement dans le snapshot d'audit et non importés comme valeurs canoniques ;
- dix références officielles : 19 pages marché confirmées, exposant 19 SKU et 19 MPN, mais aucun GTIN/EAN officiel.

## Pipeline officiel isolé

Le pipeline utilise uniquement `playmobil-official-import-2026.json`. Son dry-run bloque une référence locale existante, une absence de confirmation officielle, un nom absent ou une collision d'identifiant. L'application crée un `Product` et un unique `ProductVariant` commercial sans inventer de variante nationale. Les pages marché deviennent des `VariantMarket`, des traductions et des `SourceRecord` séparés ; chaque observation SKU/MPN pointe vers le `SourceRecord` qui la porte.

Pour les dix références 72216, 72220, 72221, 72222, 72224, 72269, 72365, 72366, 72367 et 72368, le dry-run prévoit :

- 10 produits, 10 variantes et 10 références ;
- 19 traductions officielles ;
- 38 observations d'identifiants SKU/MPN ;
- 140 observations média avant déduplication par URL ;
- 15 prix officiels FR/DE ;
- aucune collision.

Les dix `releaseYear`, les dix thèmes et les dix `pieceCount` restent `NULL`, car les pages officielles consultées ne les publient pas. Les dix `figureCount` sont disponibles. Le type produit et le type de variante restent `UNKNOWN` plutôt que d'être déduits du nom.

Les références 71520 et 72240 restent candidates de découverte : aucune confirmation officielle n'a été trouvée.

## ExternalCandidate

`ExternalCandidate` est isolé du catalogue. Ses observations conservent source, URL, nom, année/mois annoncés et premières/dernières observations. Les statuts sont `DISCOVERED`, `CORROBORATED`, `OFFICIAL_CONFIRMED`, `CONFLICTING`, `REJECTED` et `IMPORTED`.

Plan initial : 58 candidats, dont 10 confirmés officiellement, 44 corroborés, 2 découverts par Koupobol seulement et 2 conflictuels (`72299`, `72300`, années 2026/2027 divergentes). Aucun candidat 2027 n'apparaît dans le catalogue.

## Radar Koupobol

Le `robots.txt` observé autorisait les pages annuelles mais interdisait `/go/`. Les conditions d'utilisation indiquent toutefois que les éléments du site ne peuvent pas être reproduits sans accord préalable. Aucun flux/API public ni permission explicite d'intégration n'a été trouvé.

Conséquence : le fetch automatisé historique est désactivé. `pnpm catalogue:radar-diff --snapshot=<fichier>` compare uniquement un snapshot obtenu manuellement ou avec permission. Il signale ajouts, disparitions, changements de nom et d'année, sans importer de produit. Une tâche hebdomadaire ne doit être activée qu'après accord écrit/API/feed fourni par Koupobol.

## Marchés et catégories

`MarketEvidence` séparait déjà `PRESENCE`, `MARKET_EDITION` et `ATTESTED_EXCLUSIVE`. Un suffixe GER/FRA n'est jamais transformé en exclusivité. Les pages pays exposent maintenant séparément ces trois niveaux et ajoutent un bloc « À chercher en … » pour les éditions/exclusivités présentes dans la wishlist.

Les six zones demandées possèdent des données : France, Allemagne, Italie, Espagne, Royaume-Uni et États-Unis. Les compteurs décrivent les attestations de la source communautaire et non une couverture commerciale exhaustive officielle.

La catégorie `Géants / XXL` reste la seule catégorie transversale créée : 42 variantes, règle `format = Decoration toy` et appellation XXL comme mot entier. Les promotions/catalogues restent des `ProductKind`; aucune catégorie « édition limitée », « licence » ou « collaboration » n'est créée sans preuve structurée.

## Prix et offres

`Retailer`, `Offer`, `PriceObservation` et `ListPriceObservation` existaient déjà et sont conservés. `PriceObservation` reste append-only. L'interface sépare maintenant offres neuves/scellées et occasion, montre prix, livraison et total, et ne calcule une remise que pour une offre neuve/scellée fraîche, du même marché et de la même devise qu'un prix officiel.

- eBay Browse : adaptateur de candidats existant ; activation impossible sans identifiants développeur. `EBAY_FR` et `EBAY_DE` sont supportés officiellement. Le matching exige un EAN/GTIN exact ou la marque PLAYMOBIL avec une référence exacte isolée.
- Kelkoo Publisher Shopping API : adaptateur de matching ajouté ; nécessite un compte Publisher et un JWT. Un EAN exact est prioritaire ; sans EAN, la référence exacte et la marque structurée PLAYMOBIL sont toutes deux obligatoires. Aucune requête n'est faite sans contrat/clé.
- Koupobol : aucune ingestion de prix sans API, feed ou partenariat explicite.
- Leboncoin et Dealabs : liens de recherche manuels uniquement.

Après l'import officiel prévu, la couverture passe de 78 à 93 observations de prix : France 45, Allemagne 48, sur 51 références locales. Aucune offre marchande n'est créée artificiellement.
