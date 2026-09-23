# Production logs and alerts

## Local log hygiene

Install `infra/logrotate/pharmate` as `/etc/logrotate.d/pharmate` and include
`infra/nginx-logging.conf` in Nginx's `http` block before using
`infra/nginx.conf`. This retains compressed daily PM2, Nginx, and backup logs
for 30 days with a 100 MB per-file safety limit.

Application HTTP logs are JSON in production and include request ID, method,
path without query parameters, status, duration, and source IP. They never log
authorization headers, request bodies, passwords, tokens, inquiry text, or
prescription data.

## Centralize and alert

Forward `/var/log/pm2/pharmate-*.log`, `/var/log/nginx/pharmate-*.log`, and
`/var/log/pharmate-backup.log` to a managed log platform outside the VPS
(for example CloudWatch Logs). Restrict collector credentials to log delivery.

Create alerts for:

- any `Backup complete` absence or non-zero backup job result;
- scheduler lines containing `[cron:*] failed`;
- sustained 401/403 spikes, with separate alert thresholds for each;
- repeated failed logins and refresh-token reuse events from `audit_events`;
- data export events, especially multiple exports per staff account/hour;
- Nginx 5xx rate, PM2 restart count, disk usage above 80%, and upload/S3
  storage growth;
- audit-chain verification failure.

Send alerts to an administrator-controlled incident channel. Do not include
patient identifiers, medical content, tokens, or log bodies in alert messages.
