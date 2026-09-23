#!/usr/bin/env bash
#
# Encrypted off-site PharMate backup.
#
# Backs up both MySQL and the private prescription-upload directory to an AWS
# S3 bucket. The bucket must already have versioning and Object Lock enabled;
# see docs/aws-backup-runbook.md. This script never creates cloud resources.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required configuration: $name" >&2
    exit 2
  fi
}

require DB_HOST
require DB_NAME
require DB_USER
require BACKUP_S3_URI
require BACKUP_KMS_KEY_ID

command -v aws >/dev/null || { echo "AWS CLI v2 is required." >&2; exit 2; }
command -v mysqldump >/dev/null || { echo "mysqldump is required." >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum is required." >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 2; }

DB_PORT="${DB_PORT:-3306}"
UPLOADS_DIR="${UPLOADS_DIR:-$HERE/uploads}"
S3_BASE="${BACKUP_S3_URI%/}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 8)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pharmate-backup.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

DATABASE_ARCHIVE="$TMP_DIR/database.sql.gz"
UPLOADS_ARCHIVE="$TMP_DIR/prescription-uploads.tar.gz"
MANIFEST="$TMP_DIR/manifest.sha256"

echo "Creating database backup $RUN_ID"
MYSQL_PWD="${DB_PASS:-}" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
  --single-transaction --quick --routines --triggers --events \
  "$DB_NAME" | gzip -c > "$DATABASE_ARCHIVE"

if [ -d "$UPLOADS_DIR" ]; then
  echo "Creating private-upload backup"
  tar -C "$UPLOADS_DIR" --exclude='.gitkeep' -czf "$UPLOADS_ARCHIVE" .
else
  tar -C "$TMP_DIR" -czf "$UPLOADS_ARCHIVE" --files-from /dev/null
fi

(cd "$TMP_DIR" && sha256sum "$(basename "$DATABASE_ARCHIVE")" "$(basename "$UPLOADS_ARCHIVE")") \
  > "$MANIFEST"

upload() {
  local source="$1"
  local target="$2"
  aws s3 cp "$source" "$target" \
    --sse aws:kms \
    --sse-kms-key-id "$BACKUP_KMS_KEY_ID" \
    --only-show-errors
}

DESTINATION="$S3_BASE/$RUN_ID"
echo "Uploading encrypted backup to $DESTINATION"
upload "$DATABASE_ARCHIVE" "$DESTINATION/database.sql.gz"
upload "$UPLOADS_ARCHIVE" "$DESTINATION/prescription-uploads.tar.gz"
upload "$MANIFEST" "$DESTINATION/manifest.sha256"

# Verify the manifest was accepted by the remote store before removing the
# local temporary files. The S3 bucket policy must deny unencrypted uploads.
aws s3 ls "$DESTINATION/manifest.sha256" >/dev/null

echo "Backup complete: $DESTINATION"
