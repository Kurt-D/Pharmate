#!/usr/bin/env bash
# PharMate deploy script — runs on the VPS
# Usage: ./infra/deploy.sh
# Prerequisites: git, Node.js 20+, npm, PM2, MySQL 8, curl, and a production
# server/.env file. See docs/DEPLOYMENT.md before first use.
set -euo pipefail
umask 027

DEPLOY_DIR="/var/www/pharmate"
REPO_URL="https://github.com/Kurt-D/Pharmate.git"
BRANCH="${DEPLOY_BRANCH:-main}"
LOCK_FILE="/tmp/pharmate-deploy.lock"

echo "Direct Git deployment is disabled. Release an approved CI artifact instead." >&2
exit 2

command -v flock >/dev/null || { echo "flock is required to prevent concurrent deployments." >&2; exit 2; }
command -v curl >/dev/null || { echo "curl is required for the post-deploy health check." >&2; exit 2; }
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another PharMate deployment is already running." >&2; exit 1; }

echo "==> PharMate deploy  $(date '+%Y-%m-%d %H:%M:%S')"

# 1. Pull latest code
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "--- Pulling latest from $BRANCH"
  git -C "$DEPLOY_DIR" fetch origin
  git -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH"
else
  echo "--- Cloning repo into $DEPLOY_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"

# Production secrets are intentionally not in Git. Fail before migrations or
# process reload if the server has not been configured.
[ -f server/.env ] || { echo "Missing $DEPLOY_DIR/server/.env" >&2; exit 2; }

# A configured off-site backup is taken before schema changes. Require the two
# backup settings together so a typo never creates a false sense of protection.
if grep -q '^BACKUP_S3_URI=.' server/.env || grep -q '^BACKUP_KMS_KEY_ID=.' server/.env; then
  grep -q '^BACKUP_S3_URI=.' server/.env || { echo "BACKUP_S3_URI is missing." >&2; exit 2; }
  grep -q '^BACKUP_KMS_KEY_ID=.' server/.env || { echo "BACKUP_KMS_KEY_ID is missing." >&2; exit 2; }
  echo "--- Creating encrypted pre-deploy backup"
  bash ./server/scripts/backup.sh
else
  echo "--- WARNING: AWS backup is not configured; no pre-deploy recovery point was created" >&2
fi

# 2. Install server dependencies
echo "--- Installing server dependencies"
npm --prefix server ci --omit=dev

# 3. Run migrations
echo "--- Running database migrations"
[ -n "${MIGRATION_DB_USER:-}" ] || { echo "MIGRATION_DB_USER is required for production migrations." >&2; exit 2; }
[ -n "${MIGRATION_DB_PASS:-}" ] || { echo "MIGRATION_DB_PASS is required for production migrations." >&2; exit 2; }
DB_USER="$MIGRATION_DB_USER" DB_PASS="$MIGRATION_DB_PASS" npm --prefix server run migrate

# 4. Build client (React → dist/)
# NOTE: build tooling (Vite, plugins) lives in devDependencies, so the client
# install must include dev deps or `vite build` will fail. The built dist/ is
# static — none of these dev packages run at serve time.
echo "--- Building client"
npm --prefix client ci --include=dev
npm --prefix client run build

# 5. Reload PM2 (starts fresh if not running)
echo "--- Reloading PM2"
pm2 startOrReload infra/pm2.config.cjs --update-env

# The health route verifies both the HTTP server and the MySQL connection.
echo "--- Checking application health"
for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
    echo "==> Deploy complete"
    exit 0
  fi
  sleep 2
done

echo "Deployment failed health verification. Inspect PM2 logs before retrying." >&2
exit 1
