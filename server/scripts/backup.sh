#!/usr/bin/env bash
#
# Nightly MySQL backup (Sprint 8, task 1). Dumps the PharMate database to a
# timestamped, gzipped file. Intended to run from cron on the host, e.g.:
#
#   0 2 * * *  /path/to/server/scripts/backup.sh >> /var/log/pharmate-backup.log 2>&1
#
# OFF-BOX: after the local dump succeeds, ship it off the box (rsync/scp to a
# separate host or object store) — a backup on the same server does not survive a
# host loss. That copy step is deployment-specific and lives in the ops runbook.
#
# Restore (rehearse this — it is the Sprint 8 exit gate):
#   gunzip -c pharmate-YYYYmmdd-HHMMSS.sql.gz | mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME"
#
# Reads DB_* from the environment (or server/.env if present).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-pharmate}"
DB_USER="${DB_USER:-pharmate}"
BACKUP_DIR="${BACKUP_DIR:-$HERE/backups}"

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/pharmate-$(date +%Y%m%d-%H%M%S).sql.gz"

# --single-transaction: consistent dump without locking (InnoDB).
MYSQL_PWD="${DB_PASS:-}" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers \
  "$DB_NAME" | gzip -c > "$OUT"

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Retention: keep the 14 most recent local dumps.
ls -1t "$BACKUP_DIR"/pharmate-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
