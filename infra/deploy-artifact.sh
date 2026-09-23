#!/usr/bin/env bash
# Deploy a CI-produced immutable artifact. Never fetches from Git.
set -euo pipefail
umask 027

ARTIFACT="${1:?artifact path is required}"
RELEASE_ID="${2:?release id is required}"
BASE_DIR="/var/www/pharmate"
RELEASE_DIR="$BASE_DIR/releases/$RELEASE_ID"
ENV_FILE="$BASE_DIR/shared/server.env"
UPLOADS_DIR="$BASE_DIR/shared/uploads"

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "Invalid release ID." >&2; exit 2; }
[ -f "$ARTIFACT" ] || { echo "Artifact not found." >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "Missing protected environment file: $ENV_FILE" >&2; exit 2; }
[[ ! -e "$RELEASE_DIR" ]] || { echo "Release directory already exists." >&2; exit 2; }
mkdir -p "$BASE_DIR/releases" "$RELEASE_DIR" "$UPLOADS_DIR"
chmod 700 "$UPLOADS_DIR"
tar -xzf "$ARTIFACT" -C "$RELEASE_DIR"
cp "$ENV_FILE" "$RELEASE_DIR/server/.env"
# Runtime patient uploads are deliberately outside versioned release folders.
ln -s "$UPLOADS_DIR" "$RELEASE_DIR/server/uploads"

# The protected server environment supplies the migration-only credentials.
set -a
. "$ENV_FILE"
set +a

npm --prefix "$RELEASE_DIR/server" ci --omit=dev
DB_USER="${MIGRATION_DB_USER:?}" DB_PASS="${MIGRATION_DB_PASS:?}" npm --prefix "$RELEASE_DIR/server" run migrate

PREVIOUS_RELEASE="$(readlink -f "$BASE_DIR/current" 2>/dev/null || true)"
ln -sfn "$RELEASE_DIR" "$BASE_DIR/current"
pm2 startOrReload "$BASE_DIR/current/infra/pm2.config.cjs" --update-env
if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health >/dev/null; then
  echo "Release health check failed; restoring the previous release." >&2
  if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$BASE_DIR/current"
    pm2 startOrReload "$BASE_DIR/current/infra/pm2.config.cjs" --update-env
  fi
  exit 1
fi
rm -f "$ARTIFACT"
echo "Released immutable artifact $RELEASE_ID"
