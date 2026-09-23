# Production deployment

This repository deploys to a Linux VPS from an approved GitHub Actions artifact.
The server never pulls source code from Git for a production release. This does
not provision AWS infrastructure, issue TLS certificates, or create database users.

## First-time production setup

1. Provision a supported Linux host with Node.js 20+, MySQL 8/MariaDB, Nginx,
   PM2, curl, cron, and the AWS CLI v2. Install the checked-in `infra/` scripts
   into `/var/www/pharmate/infra`, and create `/var/www/pharmate/shared`.
2. Create `/var/www/pharmate/shared/server.env` with production-only secrets,
   exact public origins, and `UPLOADS_DIR=/var/www/pharmate/shared/uploads`.
   Add `MIGRATION_DB_USER` and `MIGRATION_DB_PASS` for the separate migration
   account. Keep the directory owned and readable only by the deployment user.
3. Configure HTTPS using `infra/nginx.conf`; replace `YOUR_DOMAIN_HERE` and
   install a valid certificate before exposing the service.
4. Complete the S3/KMS setup in `aws-backup-runbook.md`, configure
   `BACKUP_S3_URI` and `BACKUP_KMS_KEY_ID` in `shared/server.env`, then run one
   manual backup successfully.
5. Install the encrypted backup schedule:

   ```bash
   bash /var/www/pharmate/infra/install-backup-schedule.sh
   ```

6. Configure PM2 startup for the deployment user, and configure log rotation
   for `/var/log/pm2/` and `/var/log/pharmate-backup.log`.

## Each release

Merge to `main` only after CI passes. A successful main-branch CI run triggers
**Approved production release**; configure the GitHub `production` environment
with required reviewers so it cannot deploy until an authorized reviewer
approves it. Configure these environment secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`

The workflow copies the immutable artifact to the host and runs:

```bash
bash /var/www/pharmate/infra/deploy-artifact.sh /tmp/pharmate-RELEASE.tgz RELEASE_ID
```

The deploy script installs exact locked server dependencies, runs migrations with
the separate migration account, switches the `current` release symlink, reloads
PM2, and verifies `/api/health` including MySQL connectivity. Uploads live at
`shared/uploads`, outside every release artifact. A failed health check restores
the prior release symlink and reloads it.

It intentionally stops if migrations or the health check fails. Configure the
pre-release backup in the release workflow or operating procedure before using
this in production; a deployment must never be treated as a backup.

## Rollback

Do not use an application rollback to reverse a database migration. First
confirm the recovery plan, take a fresh backup, and follow the migration's
documented rollback path or restore to an isolated environment. Record the
incident and the deployed commit SHA.
