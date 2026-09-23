# Audit integrity controls

New `audit_events` records are hash-chained. Each event includes the previous
event hash and a SHA-256 hash of its security-relevant fields, which makes row
deletion, insertion, or modification detectable during verification. The chain
starts at migration `061`; older audit records are not retroactively altered.

Verify the chain after a recovery drill and before off-server export:

```bash
npm --prefix server run verify:audit-chain
```

## Production database accounts

Use separate accounts. The application account may `INSERT` and `SELECT` audit
events, but must not receive `UPDATE`, `DELETE`, `DROP`, or `ALTER` permissions
on `audit_events` or `audit_chain_state`. Use a separate, time-limited recovery
or reporting role for audit export. Apply grants with the database owner after
substituting the real database, host, and account names:

```sql
REVOKE UPDATE, DELETE, DROP, ALTER ON pharmate.audit_events FROM 'pharmate_app'@'%';
REVOKE UPDATE, DELETE, DROP, ALTER ON pharmate.audit_chain_state FROM 'pharmate_app'@'%';
GRANT SELECT, INSERT ON pharmate.audit_events TO 'pharmate_app'@'%';
GRANT SELECT, UPDATE ON pharmate.audit_chain_state TO 'pharmate_app'@'%';
```

The final `UPDATE` permission is required only to advance the chain pointer.
For stronger separation, replace it with a stored procedure owned by the
database owner that performs the insert and chain update.

## Off-server export

Export audit logs daily to the protected S3 backup prefix using a distinct IAM
recovery/export role. Enable Object Lock and retain exports according to the
approved retention policy. Verify the hash chain before export and during every
restore drill.
