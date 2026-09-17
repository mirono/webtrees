<?php

/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

declare(strict_types=1);

// One-off script (see docs/php-to-js-migration/phase5-postgres-setup-cli.md)
// to (re)generate golden/postgres-schema.sql: runs the REAL PHP
// migration system (the same code the browser setup wizard uses) against
// a fresh, empty PostgreSQL database, bringing it to the current
// Webtrees::SCHEMA_VERSION. Run this against a throwaway DB, then dump
// the result with pg_dump — this script does not write any SQL file
// itself, it just performs the real schema-creation side effect so
// pg_dump has something to capture.
//
// Re-run this (and re-dump) whenever Webtrees::SCHEMA_VERSION changes —
// do not hand-edit golden/postgres-schema.sql.
//
// Usage:
//   php bin/characterize_postgres_schema.php \
//     --host=localhost --port=5432 --user=webtrees --pass=webtrees \
//     --dbname=webtrees_golden --prefix=wt_
//
// Then, from outside PHP:
//   docker compose exec postgres pg_dump --schema-only --no-owner \
//     --no-privileges -U webtrees webtrees_golden > golden/postgres-schema.sql

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\Services\MigrationService;
use Fisharebest\Webtrees\Webtrees;

// MigrationService::updateSchema() calls Site::setPreference(), which
// logs via Log::addConfigurationLog(), which reads Registry::container()
// - a typed static property that throws if accessed before
// initialization. Webtrees::bootstrap() is the app's normal, in-memory-only
// (no DB/config-file access) factory/container wiring - safe to call
// here before DB::connect().
(new Webtrees())->bootstrap();

$options = getopt('', ['host:', 'port:', 'user:', 'pass:', 'dbname:', 'prefix::']);

$host   = $options['host'] ?? '';
$port   = $options['port'] ?? '';
$user   = $options['user'] ?? '';
$pass   = $options['pass'] ?? '';
$dbname = $options['dbname'] ?? '';
$prefix = $options['prefix'] ?? 'wt_';

if ($host === '' || $port === '' || $user === '' || $dbname === '') {
    fwrite(STDERR, "Usage: php bin/characterize_postgres_schema.php --host=... --port=... --user=... --pass=... --dbname=... [--prefix=wt_]\n");
    exit(1);
}

DB::connect(
    driver: DB::POSTGRESQL,
    host: $host,
    port: $port,
    database: $dbname,
    username: $user,
    password: $pass,
    prefix: $prefix,
    key: '',
    certificate: '',
    ca: '',
    verify_certificate: false,
);

$migration_service = new MigrationService();

$applied = $migration_service->updateSchema('\Fisharebest\Webtrees\Schema', 'WT_SCHEMA_VERSION', Webtrees::SCHEMA_VERSION);

echo $applied ? "Schema created/updated to version " . Webtrees::SCHEMA_VERSION . ".\n" : "Schema already up to date.\n";

// Run the seeders too, just to prove they don't error against Postgres —
// the actual seed SQL shipped in golden/postgres-seed.sql is
// hand-written from these same 3 seeders' source, not dumped from here.
$migration_service->seedDatabase();

echo "Seeders ran without error.\n";
echo "Now run pg_dump against this database to capture golden/postgres-schema.sql (see this file's header comment).\n";
