# AWS backup and recovery runbook

This runbook protects PharMate's MySQL database and the private prescription
upload directory. It does not expose uploads through a public S3 URL.

## One-time AWS setup

1. Create a dedicated private S3 bucket in the approved AWS Region. Do not put
   patient names, emails, or diagnoses in the bucket name or object names.
2. Enable S3 Versioning and Object Lock before any backup is uploaded. Object
   Lock cannot be disabled after it is enabled. Choose a retention period with
   the organization's privacy and legal owner; 35 days is a reasonable initial
   technical baseline, not a retention-policy decision.
3. Create a dedicated customer-managed AWS KMS key. Enable rotation and limit
   use to the backup job and approved recovery operators.
4. Start from [`infra/aws-backup-bucket-policy.json`](../infra/aws-backup-bucket-policy.json),
   replace both placeholders, and add it as the bucket policy. It denies non-TLS
   requests and uploads that are not encrypted with the chosen KMS key.
5. Attach [`infra/aws-backup-iam-policy.json`](../infra/aws-backup-iam-policy.json)
   to the backup workload role after replacing its placeholders. Do not add
   `kms:Decrypt` or `s3:GetObject` to this routine backup role.
6. Use an IAM instance profile or narrowly-scoped workload credentials. Do not
   store a long-lived AWS secret in the PharMate repository or `.env` file.
7. Enable CloudTrail data events for this bucket, an AWS Budget alert, and an
   alert for failed backup jobs.

The backup job needs only the minimum S3 and KMS permissions required to write
its prefix and verify the manifest. Recovery access must be a separate,
time-limited role that has `s3:GetObject` for the selected recovery prefix and
`kms:Decrypt` on the backup key.

## Server configuration

Set the following server environment values outside version control:

```dotenv
BACKUP_S3_URI=s3://your-private-pharmate-backups/pharmate
BACKUP_KMS_KEY_ID=arn:aws:kms:your-region:account-id:key/key-id
AWS_REGION=your-approved-region
```

Install AWS CLI v2 on the production host and grant its instance role access to
the backup prefix. Verify the account identity before the first run:

```bash
aws sts get-caller-identity
```

Install the managed schedule after configuration (it runs at 02:00 server time):

```bash
bash /var/www/pharmate/infra/install-backup-schedule.sh
```

Use log rotation and alert on any non-zero backup exit status.

## Recovery drill

Perform restores only in an isolated environment with notifications disabled.
Use a separate recovery database account that can create a database, but cannot
access production through the application. Set the `RECOVERY_*` values shown in
`.env.example`; the database name must end in `_recovery` and the recovery
upload directory must not already exist.

1. Assume the approved, temporary recovery IAM role and choose a backup prefix.
2. Run the guarded drill script. It downloads the artifacts, verifies the
   manifest, refuses existing targets, restores to a new database and private
   upload directory, and confirms that tables exist:

```bash
bash /var/www/pharmate/server/scripts/restore-drill.sh \
  s3://your-private-pharmate-backups/pharmate/YYYYMMDDTHHMMSSZ-random
```

3. Confirm login, schedules, order records, audit events, and authorized
   prescription access using test accounts only.
4. Record the recovery duration, data timestamp, backup prefix, table count,
   upload count, failures, and corrective actions. Run this drill at least
   monthly.
5. Remove the recovery database and upload directory only after recording the
   result and receiving approval under the incident/recovery procedure.

Never restore directly into production without an approved incident procedure.
