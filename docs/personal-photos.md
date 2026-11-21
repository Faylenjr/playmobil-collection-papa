# Photos personnelles

Depuis la fiche d’une variante, **Ajouter ma photo** ouvre l’appareil photo ou
la photothèque. La fiche montre un aperçu avant l’enregistrement. Le remplacement
et le retrait demandent une confirmation. Une photo enregistrée devient la
première image de cette variante.

## Stockage et accès

La table PostgreSQL `personal_photos` contient une photo WebP par variante,
sans métadonnées EXIF, avec un côté limité à 1 600 pixels et une taille maximale
de 1,5 Mio. Un changement de photo met à jour son lien dans `media_assets`
dans la même transaction. Les images officielles et historiques restent
disponibles pour le repli.

Appliquer la migration avant de renseigner les variables de production
`PLAYMOBIL_PHOTO_ORIGIN`, `PLAYMOBIL_ACCESS_ISSUER` et
`PLAYMOBIL_ACCESS_AUDIENCE`. L’origine désigne le site HTTPS, l’émetteur
désigne le domaine d’équipe Cloudflare Access et l’audience identifie
l’application Access. Le serveur vérifie la signature et les claims du jeton
sur chaque lecture et écriture. Les modifications exigent également l’origine
du site. Les réponses restent privées et hors cache.

Pour suspendre la fonction, retirer ces variables et recréer seulement le
conteneur Web. Utiliser le mécanisme de retour arrière Web habituel si
nécessaire et laisser la table en place pour conserver les photos.

## Sauvegardes et récupération

Le volume persistant PostgreSQL porte les fichiers et leurs associations.
Chaque dump complet déjà planifié copie les deux. Le snapshot Restic du dump
emporte donc aussi les photos.

Pour vérifier ou récupérer une photo, restaurer d’abord un dump validé dans une
base ou un conteneur isolé en suivant la
[procédure existante](postgres-backups.md#test-de-restauration-non-destructif).
Dans cet environnement, exporter la photo de la variante souhaitée avec
`psql -XAt` et convertir l’hexadécimal en fichier WebP :

```sh
psql -XAt -d "$RESTORE_DB" -v variant="$VARIANT_UUID" <<'SQL' | xxd -r -p > photo-restauree.webp
SELECT encode(data, 'hex') FROM personal_photos WHERE variant_id = :'variant'::uuid;
SQL
test -s photo-restauree.webp
sha256sum photo-restauree.webp
```

Comparer le SHA-256 à la colonne `revision` de la même ligne restaurée.
Pour remettre la photo en service, sélectionner le fichier restauré depuis
la fiche de la variante sur le site.
