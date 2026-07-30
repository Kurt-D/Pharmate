#!/usr/bin/env bash
# PharMate deploy script — runs on the VPS
# Usage: ./infra/deploy.sh
# Prerequisites: git, node 20+, npm, PM2, MySQL 8 running
set -euo pipefail

DEPLOY_DIR="/var/www/pharmate"
REPO_URL="https://github.com/Kurt-D/Pharmate.git"
BRANCH="${DEPLOY_BRANCH:-main}"

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

# 2. Install server dependencies
echo "--- Installing server dependencies"
npm --prefix server install --omit=dev

# 3. Run migrations
echo "--- Running database migrations"
npm --prefix server run migrate

# 4. Build client (React → dist/)
# NOTE: build tooling (Vite, plugins) lives in devDependencies, so the client
# install must include dev deps or `vite build` will fail. The built dist/ is
# static — none of these dev packages run at serve time.
echo "--- Building client"
npm --prefix client install --include=dev
npm --prefix client run build

# 5. Reload PM2 (starts fresh if not running)
echo "--- Reloading PM2"
pm2 startOrReload infra/pm2.config.cjs --update-env

echo "==> Deploy complete"
