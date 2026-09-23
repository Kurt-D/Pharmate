-- Run once as a MySQL database administrator after replacing every placeholder.
-- Do not run this file with values committed to source control.

CREATE USER IF NOT EXISTS 'REPLACE_APP_USER'@'REPLACE_APP_HOST'
  IDENTIFIED BY 'REPLACE_WITH_LONG_RANDOM_PASSWORD' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `REPLACE_DATABASE`.*
  TO 'REPLACE_APP_USER'@'REPLACE_APP_HOST';

-- Migrations run under a separate, time-limited administrator account, never
-- from the web process. Grant only while applying approved migrations.
CREATE USER IF NOT EXISTS 'REPLACE_MIGRATION_USER'@'REPLACE_ADMIN_HOST'
  IDENTIFIED BY 'REPLACE_WITH_DIFFERENT_LONG_RANDOM_PASSWORD' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP
  ON `REPLACE_DATABASE`.* TO 'REPLACE_MIGRATION_USER'@'REPLACE_ADMIN_HOST';

-- Remove unsafe defaults. Verify host-specific accounts first with
-- SELECT user,host FROM mysql.user; before executing any DROP USER statement.
DROP USER IF EXISTS ''@'localhost';
DROP USER IF EXISTS ''@'%';
DROP USER IF EXISTS 'root'@'%';
FLUSH PRIVILEGES;
