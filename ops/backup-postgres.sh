#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PLAYMOBIL_PROJECT_DIR:-/root/playmobil-collection-papa}"
BACKUP_DIR="${PLAYMOBIL_BACKUP_DIR:-/root/playmobil-db-backups}"
OFFSITE_STAGE="${PLAYMOBIL_OFFSITE_STAGE:-/media/stockage/backups/playmobil-postgresql}"
LOCK_FILE="${PLAYMOBIL_BACKUP_LOCK:-/run/lock/playmobil-postgres-backup.lock}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || fail "une sauvegarde PostgreSQL Playmobil est déjà en cours"

[[ -d "$PROJECT_DIR" ]] || fail "projet absent: $PROJECT_DIR"
install -d -m 0700 "$BACKUP_DIR"
cd "$PROJECT_DIR"
docker compose ps --status running --services | grep -qx postgres || fail "service postgres non démarré"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/playmobil-$stamp"
partial="$base.dump.partial"
trap 'rm -f -- "$partial" "$partial.list" "$partial.sha256" "$partial.counts"' ERR INT TERM

log "création du dump custom PostgreSQL"
docker compose exec -T postgres pg_dump -U playmobil -d playmobil -Fc >"$partial"
[[ -s "$partial" ]] || fail "dump vide"

log "validation pg_restore --list"
docker compose exec -T postgres pg_restore --list <"$partial" >"$partial.list"
[[ -s "$partial.list" ]] || fail "liste pg_restore vide"

docker compose exec -T postgres psql -U playmobil -d playmobil -Atc \
  "SELECT 'collection_items='||count(*) FROM collection_items; SELECT 'wishlist_items='||count(*) FROM wishlist_items; SELECT 'product_variants='||count(*) FROM product_variants;" \
  >"$partial.counts"
sha256sum "$partial" >"$partial.sha256"

mv "$partial" "$base.dump"
mv "$partial.list" "$base.dump.list"
mv "$partial.counts" "$base.dump.counts"
sed "s#${partial//\#/\\#}#${base//\#/\\#}.dump#" "$partial.sha256" >"$base.dump.sha256"
rm -f -- "$partial.sha256"
sha256sum -c "$base.dump.sha256" >/dev/null

if mountpoint -q /media/stockage; then
  install -d -m 0700 "$OFFSITE_STAGE"
  for suffix in dump dump.list dump.counts dump.sha256; do
    install -m 0600 "$base.$suffix" "$OFFSITE_STAGE/$(basename "$base.$suffix")"
  done
  (cd "$OFFSITE_STAGE" && sha256sum -c "$(basename "$base.dump.sha256")" >/dev/null)
  log "copie de transit hors site validée: $OFFSITE_STAGE/$(basename "$base.dump")"
else
  log "WARNING: /media/stockage absent; copie locale conservée, transit hors site non préparé"
fi

remove_bundle() {
  local root="$1" dump="$2"
  [[ "$(dirname "$dump")" == "$root" && "$(basename "$dump")" == playmobil-*.dump ]] || fail "cible de rétention invalide: $dump"
  rm -f -- "$dump" "$dump.list" "$dump.counts" "$dump.sha256"
}

prune_directory() {
  local root="$1" now age epoch day
  [[ -d "$root" ]] || return 0
  declare -A kept_days=()
  now="$(date -u +%s)"
  while IFS= read -r -d '' record; do
    epoch="${record%% *}"; epoch="${epoch%.*}"
    dump="${record#* }"
    age=$((now - epoch))
    if (( age <= 172800 )); then
      continue
    fi
    if (( age <= 2592000 )); then
      day="$(date -u -d "@$epoch" +%F)"
      if [[ -z "${kept_days[$day]:-}" ]]; then
        kept_days[$day]=1
        continue
      fi
    fi
    remove_bundle "$root" "$dump"
  done < <(find "$root" -maxdepth 1 -type f -name 'playmobil-*.dump' -printf '%T@ %p\0' | sort -z -nr)
}

prune_directory "$BACKUP_DIR"
prune_directory "$OFFSITE_STAGE"

trap - ERR INT TERM
log "BACKUP_OK file=$base.dump size=$(stat -c %s "$base.dump") sha256=$(cut -d' ' -f1 "$base.dump.sha256")"
cat "$base.dump.counts"
