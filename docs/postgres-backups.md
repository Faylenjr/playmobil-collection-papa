# Sauvegardes PostgreSQL Playmobil

Les données de collection et de wishlist sont des données utilisateur à préserver. Les dumps ne sont jamais stockés dans Git.

## Architecture active

- logique versionnée : `ops/backup-postgres.sh` ;
- copies locales LXC 101 : `/root/playmobil-db-backups/` ;
- transit sur le stockage du homelab : `/mnt/stockage/backups/playmobil-postgresql/` (visible dans le LXC sous `/media/stockage/...`) ;
- exécution : `playmobil-postgres-backup.timer`, toutes les quatre heures ;
- hors site : dépôt Restic chiffré `rclone:gdrive_homelab:Homelab-Backup/restic`, tag `playmobil-postgres`.

Chaque passage produit un dump custom `pg_dump -Fc`, sa liste `pg_restore --list`, les compteurs clés et un SHA-256. Un fichier vide, une liste invalide ou un checksum incorrect fait échouer le passage. L'échec de Restic ne supprime jamais le dump local.

Rétention locale : toutes les sauvegardes des dernières 48 heures, puis la plus récente de chaque jour jusqu'à 30 jours. Restic conserve également toutes les sauvegardes pendant 48 heures puis une sauvegarde quotidienne pendant 30 jours. Le nettoyage physique des blocs Restic est laissé à la maintenance générale du dépôt.

## Vérification courante

```bash
systemctl status playmobil-postgres-backup.timer
journalctl -u playmobil-postgres-backup.service -n 100 --no-pager
find /root/playmobil-db-backups -maxdepth 1 -name 'playmobil-*.dump' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort
```

## Test de restauration non destructif

Depuis le LXC 101, choisir un dump puis restaurer dans une base temporaire :

```bash
cd /root/playmobil-collection-papa
dump=/root/playmobil-db-backups/playmobil-YYYYMMDDTHHMMSSZ.dump
sha256sum -c "$dump.sha256"
docker compose exec -T postgres pg_restore --list < "$dump" >/dev/null
tmpdb="playmobil_restore_test_$(date -u +%Y%m%d%H%M%S)"
docker compose exec -T postgres createdb -U playmobil "$tmpdb"
docker compose exec -T postgres pg_restore -U playmobil -d "$tmpdb" --no-owner < "$dump"
docker compose exec -T postgres psql -U playmobil -d "$tmpdb" -c \
  'SELECT count(*) FROM collection_items; SELECT count(*) FROM wishlist_items; SELECT count(*) FROM product_variants;'
docker compose exec -T postgres dropdb -U playmobil "$tmpdb"
```

Ne jamais utiliser la base `playmobil` comme cible d'un test.

## Restauration d'urgence

1. Arrêter uniquement le service web : `docker compose stop web`.
2. Créer un nouveau dump de l'état courant, même s'il semble endommagé.
3. Restaurer d'abord le dump choisi dans une base temporaire et comparer les compteurs.
4. Pour récupérer un dump hors site sur l'hôte Proxmox :

```bash
source /etc/homelab-monitoring/restic.env
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RCLONE_CONFIG RESTIC_CACHE_DIR
restic snapshots --host homeclap --tag playmobil-postgres
install -d -m 0700 /mnt/stockage/restic-restore-tests/playmobil
restic restore SNAPSHOT_ID --target /mnt/stockage/restic-restore-tests/playmobil
```

5. Après validation explicite seulement, restaurer vers une base neuve ou remplacer la base active selon une procédure planifiée. Ne jamais exécuter `docker compose down -v`.
