# Production database security

Use `infra/mysql-production-accounts.sql` as a template with a database
administrator. The web application must use a dedicated non-root account;
migrations must use a separate, temporary account. Never place either password
in Git, logs, or a support ticket.

Set `MIGRATION_DB_USER` and `MIGRATION_DB_PASS` only in the protected server
environment. `infra/deploy.sh` uses those values for `npm run migrate` while
the PM2 application continues with the lower-privilege `DB_USER` account.

For a database on another host, set `DB_TLS_REQUIRED=true` and provide the
database CA at `DB_TLS_CA_PATH`. PharMate then rejects invalid certificates.
The app refuses to start in production with `root`, a blank database password,
or a non-local database that lacks required TLS.

Keep MySQL private: bind it to localhost/private networking, deny port 3306 in
public security groups, disable remote root and anonymous accounts, and encrypt
the database volume and backups at rest. Test the application account grants
and TLS connection before switching production traffic.
