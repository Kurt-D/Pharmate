#!/usr/bin/env bash
# Read-only production access inventory. Run as a privileged administrator on
# the VPS and save its output in the incident/security evidence store.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/pharmate}"
section() { printf '\n===== %s =====\n' "$1"; }
run() { "$@" 2>&1 || printf '[unavailable: %s]\n' "$*"; }

section "Host identity and privileged accounts"
run hostnamectl
run id
run getent passwd
run getent group sudo
run getent group wheel

section "SSH access (public keys only; private keys are never read)"
run sshd -T
run find /root /home -path '*/.ssh/authorized_keys' -type f -print -exec sed -n 's/^[[:space:]]*\([^#[:space:]][^[:space:]]*\).*/key-type: \1/p' {} \;

section "Scheduled tasks and services"
run systemctl list-unit-files --type=service --state=enabled
run systemctl list-timers --all
run crontab -l
run find /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly -maxdepth 1 -type f -print

section "Network and firewall"
run ss -lntup
run ufw status verbose
run firewall-cmd --list-all

section "Application process and configuration permissions"
run pm2 list
run pm2 describe pharmate-server
run stat -c '%a %U:%G %n' "$DEPLOY_DIR/server/.env" "$DEPLOY_DIR/server/uploads" "$DEPLOY_DIR/infra/pm2.config.cjs"
run nginx -T

section "Repository provenance"
run git -C "$DEPLOY_DIR" remote -v
run git -C "$DEPLOY_DIR" status --short
run git -C "$DEPLOY_DIR" log --all --decorate --oneline -50

section "MySQL account inventory"
printf 'Run this manually with a database administrator account; do not paste credentials into this report:\n'
printf "  SELECT user,host,account_locked FROM mysql.user ORDER BY user,host;\n"
printf "  SHOW GRANTS FOR 'pharmate_app'@'your-app-host';\n"

printf '\nAudit complete. Review unexpected users, SSH keys, listeners, cron jobs, PM2 apps, Git remotes, and MySQL grants.\n'
