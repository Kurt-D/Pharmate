#!/usr/bin/env bash
# Restore one PharMate backup into an isolated recovery environment.
# This script deliberately never drops or reuses a database or upload directory.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

usage() {
  echo "Usage: $0 s3://bucket/prefix/YYYYMMDDTHHMMSSZ-random" >&2
  exit 2
}

require() {
  local name="$1"
  [ -n "${!name:-}" ] || { echo "Missing required configuration: $name" >&2; exit 2; }
}

[ "$#" -eq 1 ] || usage
BACKUP_PREFIX="${1%/}"
case "$BACKUP_PREFIX" in s3://*/*) ;; *) usage ;; esac

require RECOVERY_DB_NAME
require RECOVERY_UPLOADS_DIR
require RECOVERY_DB_USER
require BACKUP_KMS_KEY_ID

[[ "$RECOVERY_DB_NAME" =~ ^[A-Za-z0-9_]+_recovery$ ]] || {
  echo "RECOVERY_DB_NAME must use only letters, numbers, underscores and end in _recovery." >&2
  exit 2
}
[ "$RECOVERY_DB_NAME" != "${DB_NAME:-}" ] || { echo "Refusing to use the production database name." >&2; exit 2; }
[ ! -e "$RECOVERY_UPLOADS_DIR" ] || { echo "RECOVERY_UPLOADS_DIR must not already exist." >&2; exit 2; }

command -v aws >/dev/null || { echo "AWS CLI v2 is required." >&2; exit 2; }
command -v mysql >/dev/null || { echo "mysql client is required." >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum is required." >&2; exit 2; }
command -v tar >/dev/null || { echo "tar is required." >&2; exit 2; }

DB_HOST="${RECOVERY_DB_HOST:-${DB_HOST:-127.0.0.1}}"
DB_PORT="${RECOVERY_DB_PORT:-${DB_PORT:-3306}}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pharmate-restore.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

DATABASE_ARCHIVE="$TMP_DIR/database.sql.gz"
UPLOADS_ARCHIVE="$TMP_DIR/prescription-uploads.tar.gz"
MANIFEST="$TMP_DIR/manifest.sha256"

echo "Downloading encrypted recovery artifacts"
aws s3 cp "$BACKUP_PREFIX/database.sql.gz" "$DATABASE_ARCHIVE" --only-show-errors
aws s3 cp "$BACKUP_PREFIX/prescription-uploads.tar.gz" "$UPLOADS_ARCHIVE" --only-show-errors
aws s3 cp "$BACKUP_PREFIX/manifest.sha256" "$MANIFEST" --only-show-errors

echo "Verifying backup checksums"
(cd "$TMP_DIR" && sha256sum --check manifest.sha256)

MYSQL_PWD="${RECOVERY_DB_PASS:-}" mysql \
  --host="$DB_HOST" --port="$DB_PORT" --user="$RECOVERY_DB_USER" \
  --batch --skip-column-names \
  --execute="SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '$RECOVERY_DB_NAME'" \
  | grep -q . && { echo "Recovery database already exists; refusing to overwrite it." >&2; exit 2; }

echo "Creating isolated database $RECOVERY_DB_NAME"
MYSQL_PWD="${RECOVERY_DB_PASS:-}" mysql \
  --host="$DB_HOST" --port="$DB_PORT" --user="$RECOVERY_DB_USER" \
  --execute="CREATE DATABASE \`$RECOVERY_DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

echo "Restoring database"
gunzip -c "$DATABASE_ARCHIVE" | MYSQL_PWD="${RECOVERY_DB_PASS:-}" mysql \
  --host="$DB_HOST" --port="$DB_PORT" --user="$RECOVERY_DB_USER" "$RECOVERY_DB_NAME"

echo "Restoring private uploads"
mkdir -m 700 "$RECOVERY_UPLOADS_DIR"
tar -C "$RECOVERY_UPLOADS_DIR" -xzf "$UPLOADS_ARCHIVE"
chmod -R go-rwx "$RECOVERY_UPLOADS_DIR"

TABLE_COUNT="$(MYSQL_PWD="${RECOVERY_DB_PASS:-}" mysql --host="$DB_HOST" --port="$DB_PORT" --user="$RECOVERY_DB_USER" "$RECOVERY_DB_NAME" --batch --skip-column-names --execute='SHOW TABLES' | wc -l | tr -d ' ')"
[ "$TABLE_COUNT" -gt 0 ] || { echo "Restore produced no database tables." >&2; exit 1; }

echo "Recovery drill completed successfully. Restored $TABLE_COUNT tables."
echo "Review the isolated data only with approved test accounts, then remove it under the incident/recovery procedure."
