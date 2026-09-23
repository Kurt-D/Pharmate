#!/usr/bin/env bash
# Installs the PharMate nightly backup schedule for the current deployment user.
# Run this once on the production host after AWS S3/KMS and server/.env are set.
set -euo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/pharmate}"
ENV_FILE="$DEPLOY_DIR/server/.env"
BACKUP_SCRIPT="$DEPLOY_DIR/server/scripts/backup.sh"
LOG_FILE="/var/log/pharmate-backup.log"
MARKER="# pharmate-encrypted-backup"
SCHEDULE="0 2 * * * /usr/bin/env bash $BACKUP_SCRIPT >> $LOG_FILE 2>&1 $MARKER"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 2; }
[ -f "$BACKUP_SCRIPT" ] || { echo "Missing backup script: $BACKUP_SCRIPT" >&2; exit 2; }
grep -q '^BACKUP_S3_URI=.' "$ENV_FILE" || { echo "BACKUP_S3_URI is missing." >&2; exit 2; }
grep -q '^BACKUP_KMS_KEY_ID=.' "$ENV_FILE" || { echo "BACKUP_KMS_KEY_ID is missing." >&2; exit 2; }
command -v crontab >/dev/null || { echo "crontab is required." >&2; exit 2; }

current_crontab="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$current_crontab" | grep -Fq "$MARKER"; then
  echo "PharMate backup schedule already exists; no change made."
  exit 0
fi

printf '%s\n%s\n' "$current_crontab" "$SCHEDULE" | crontab -
echo "Installed nightly encrypted backup schedule for 02:00 server time."
