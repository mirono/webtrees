-- Default rows for a fresh webtrees install on PostgreSQL, table prefix
-- "wt_" (hard-coded — see docs/php-to-js-migration/phase5-postgres-setup-cli.md
-- for why v1 doesn't support a custom prefix).
--
-- Hand-written directly from the 3 real PHP seeders' source
-- (app/Schema/SeedUserTable.php, SeedGedcomTable.php,
-- SeedDefaultResnTable.php), which together insert exactly these 7
-- fixed, deterministic rows — MigrationService::seedDatabase() runs all
-- three every time a webtrees install is created via the browser
-- wizard. Not generated via pg_dump --data-only (unlike
-- postgres-schema.sql): the data is small and fully static, so hand
-- transcription is more auditable than a dump of a throwaway DB.
--
-- Run after postgres-schema.sql, before creating the admin user.

-- SeedUserTable: a "default" user (id -1), used only to store default
-- preference values inherited by real users where a preference is unset.
INSERT INTO wt_user (user_id, user_name, real_name, email, password)
VALUES (-1, 'DEFAULT_USER', 'DEFAULT_USER', 'DEFAULT_USER', 'DEFAULT_USER')
ON CONFLICT (user_id) DO NOTHING;

-- SeedGedcomTable: a "default" tree (id -1), used the same way for
-- default tree preferences.
INSERT INTO wt_gedcom (gedcom_id, gedcom_name)
VALUES (-1, 'DEFAULT_TREE')
ON CONFLICT (gedcom_id) DO NOTHING;

-- SeedDefaultResnTable: default privacy restrictions applied to new trees.
-- No ON CONFLICT here: the real table's unique index is
-- (gedcom_id, xref, tag_type), and these rows all have xref = NULL —
-- Postgres (like the real schema) never treats two NULLs as conflicting
-- for uniqueness purposes, so a matching-constraint ON CONFLICT clause
-- would be silently ineffective here anyway. This SQL is only ever run
-- once, immediately after CREATE DATABASE, so that's not a problem in
-- practice.
INSERT INTO wt_default_resn (gedcom_id, tag_type, resn) VALUES
    (-1, 'SSN', 'confidential'),
    (-1, 'SOUR', 'privacy'),
    (-1, 'REPO', 'privacy'),
    (-1, 'SUBM', 'confidential'),
    (-1, 'SUBN', 'confidential');

-- Not one of the 3 seeders above - this one is critical and was found
-- missing by actually testing the real app against a CLI-provisioned
-- database, not assumed. app/Http/Middleware/UpdateDatabaseSchema.php
-- calls MigrationService::updateSchema() on EVERY request, which reads
-- the WT_SCHEMA_VERSION row from wt_site_setting via Site::getPreference()
-- and, if it's missing (empty string, coerced to 0), tries to run every
-- migration from Migration0 onward again - each of which does a plain
-- `CREATE TABLE` (Illuminate's Schema::create(), not
-- "IF NOT EXISTS"), so it would crash the very first real request to a
-- CLI-provisioned site with a "relation already exists" error. The
-- browser wizard never hits this because MigrationService::updateSchema()
-- itself sets this row as it runs each migration. This value must be
-- updated to match Webtrees::SCHEMA_VERSION whenever
-- golden/postgres-schema.sql is regenerated.
INSERT INTO wt_site_setting (setting_name, setting_value)
VALUES ('WT_SCHEMA_VERSION', '46')
ON CONFLICT (setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value;
