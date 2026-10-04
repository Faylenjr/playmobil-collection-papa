#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG=/etc/homelab-monitoring/restic.env
STAGE=/mnt/stockage/backups/playmobil-postgresql
LOCK=/run/lock/playmobil-postgres-offsite-backup.lock

[[ -r "$CONFIG" ]] || { echo "Configuration Restic absente" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE RCLONE_CONFIG RESTIC_CACHE_DIR

exec 9>"$LOCK"
flock -n 9 || { echo "Une sauvegarde Playmobil hors site est déjà en cours" >&2; exit 1; }

pct exec 101 -- /root/playmobil-collection-papa/ops/backup-postgres.sh

latest="$(find "$STAGE" -maxdepth 1 -type f -name 'playmobil-*.dump' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$latest" && -s "$latest" && "$(readlink -m "$latest")" == "$STAGE"/playmobil-*.dump ]] || {
  echo "Aucun dump Playmobil validé dans $STAGE" >&2
  exit 1
}
(cd "$STAGE" && sha256sum -c "$(basename "$latest").sha256")

restic backup \
  "$latest" "$latest.sha256" "$latest.list" "$latest.counts" \
  --host homeclap \
  --tag playmobil-postgres \
  --verbose=1

snapshot_id="$(restic snapshots --host homeclap --tag playmobil-postgres --latest 1 --json | python3 -c 'import json,sys; rows=json.load(sys.stdin); print(rows[-1]["id"] if rows else "")')"
[[ -n "$snapshot_id" ]] || { echo "Snapshot Restic Playmobil introuvable" >&2; exit 1; }
restic ls "$snapshot_id" | grep -F "$(basename "$latest")" >/dev/null

# La rétention logique est appliquée à ce tag seulement. Le prune physique reste
# dans la maintenance Restic générale pour ne pas alourdir chaque sauvegarde.
restic forget --host homeclap --tag playmobil-postgres --keep-within 48h --keep-daily 30
printf 'OFFSITE_BACKUP_OK snapshot=%s file=%s\n' "${snapshot_id:0:8}" "$(basename "$latest")"
