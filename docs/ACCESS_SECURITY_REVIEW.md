# Production access and backdoor review

## Repository review completed

The repository currently points only to `https://github.com/Kurt-D/Pharmate.git`.
Static review found no hidden shell downloader, untracked deployment workflow, or
runtime `eval`/arbitrary command execution path. This does **not** prove the
VPS, AWS account, MySQL server, or GitHub organization is free of unauthorized
access; those systems require their own inventory.

## VPS review

Run the read-only inventory as a VPS administrator:

```bash
bash /var/www/pharmate/infra/security-audit.sh | tee /root/pharmate-security-audit-$(date +%F).txt
```

Review and remove only access you can identify as unauthorized. In particular:

- SSH: disable password login/root login where operationally possible, identify
  every account and authorized key, and rotate keys after staff departures.
- Firewall: expose only 80/443 publicly; MySQL and Node should bind privately.
- Services/cron/PM2: investigate every process or timer not owned by the
  operating system or documented PharMate deployment.
- Files: `server/.env` should not be world-readable; uploads must remain
  private and outside Nginx static serving.
- MySQL: disable remote root access, remove anonymous users, and use a
  dedicated application account with only required privileges.

## Cloud and GitHub review

In AWS, review IAM users/roles, access keys, CloudTrail, S3 bucket policies,
KMS key users, EC2 security groups, and billing/IAM changes. In GitHub, review
organization/repository collaborators, teams, deploy keys, personal access
tokens, Actions workflows, environment secrets, branch protection, webhooks,
and the full commit history. Remove unknown access and rotate related secrets.

Record the reviewer, date, findings, and remediation in a security log. Repeat
at least quarterly and immediately after any suspected compromise.
