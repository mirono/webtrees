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

// PostgreSQL provisioning for setup-cli/: create the database if needed,
// run the golden schema+seed SQL, and create/update the admin user. See
// docs/php-to-js-migration/phase5-postgres-setup-cli.md for how
// golden/postgres-schema.sql was generated (a real PHP migration run,
// dumped with pg_dump) and why golden/postgres-seed.sql is hand-written
// instead.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Client } = pg;

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCHEMA_SQL_PATH = path.join(REPO_ROOT, 'golden', 'postgres-schema.sql');
const SEED_SQL_PATH = path.join(REPO_ROOT, 'golden', 'postgres-seed.sql');

// Preference names/values UserService::create() + SetupWizard's
// createConfigFile() set on a freshly-created admin
// (app/Contracts/UserInterface.php's PREF_* constants, confirmed by
// reading that file directly - these are the literal setting_name
// values stored in wt_user_setting, not the PHP constant names).
const ADMIN_PREFERENCES = (lang) => ({
  language: lang,
  visibleonline: '1',
  canadmin: '1',
  verified: '1',
  verified_by_admin: '1',
});

/**
 * Connects to Postgres's own "postgres" maintenance database (using the
 * given credentials) and creates the target database if it doesn't
 * already exist yet. Postgres has no `CREATE DATABASE IF NOT EXISTS`,
 * so this is an explicit existence-check-then-create, unlike the old
 * wizard's MySQL-only `CREATE DATABASE IF NOT EXISTS` (it never
 * attempted this for Postgres at all).
 */
export async function ensureDatabase({ host, port, user, password, database }) {
  const client = new Client({ host, port, user, password, database: 'postgres' });

  // client.end() must run even if connect() itself fails (e.g. a retry
  // loop calling this repeatedly with bad credentials/host) - otherwise
  // each failed attempt can leave a half-open socket behind, and enough
  // of those can exhaust the server's own connection limit ("sorry, too
  // many clients already"), turning a simple wrong-password retry into
  // a cascading failure for every later attempt too.
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }

  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);

    if (rows.length === 0) {
      // Database names can't be parameterized - `database` is only ever
      // supplied by the person running this CLI against their own
      // server, not untrusted input, but quote-escape it defensively
      // anyway (double any embedded double-quotes).
      const identifier = '"' + database.replaceAll('"', '""') + '"';

      await client.query(`CREATE DATABASE ${identifier}`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Lists tables already present in the target database whose name starts
 * with the given table prefix (e.g. "wt_") - used to detect a prior
 * install before blindly running the schema SQL, which would otherwise
 * fail with a raw "relation ... already exists" error partway through.
 * Every table in golden/postgres-schema.sql uses the "wt_" prefix (all
 * 32 of them, confirmed directly against that file), so this check is
 * exhaustive for the one prefix this tool supports.
 */
export async function findExistingWebtreesTables(config, tblpfx) {
  const client = new Client(config);

  await client.connect();

  try {
    // LIKE wildcards ("_" and "%") can appear in a literal prefix in
    // principle, so escape them - even though this tool only ever
    // passes the fixed "wt_" prefix today.
    const likePattern = tblpfx.replaceAll('\\', '\\\\').replaceAll('_', '\\_').replaceAll('%', '\\%') + '%';

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE $1
       ORDER BY table_name`,
      [likePattern],
    );

    return rows.map((row) => row.table_name);
  } finally {
    await client.end();
  }
}

/**
 * Drops the given tables (by exact name) from the target database, with
 * CASCADE so dependent views/foreign keys don't block the drop - used
 * to clear out a prior install once the person running this CLI has
 * explicitly confirmed they want to overwrite it.
 */
export async function dropTables(config, tableNames) {
  if (tableNames.length === 0) {
    return;
  }

  const client = new Client(config);

  await client.connect();

  try {
    const identifiers = tableNames.map((name) => '"' + name.replaceAll('"', '""') + '"').join(', ');

    await client.query(`DROP TABLE IF EXISTS ${identifiers} CASCADE`);
  } finally {
    await client.end();
  }
}

/**
 * Runs golden/postgres-schema.sql then golden/postgres-seed.sql against
 * the target database, verbatim. Safe to call only against a database
 * that doesn't already have these tables - callers should check with
 * findExistingWebtreesTables()/dropTables() first (setup-cli/index.mjs's
 * stepDatabaseConnection() does this).
 */
export async function runSchemaAndSeed(config) {
  const client = new Client(config);

  await client.connect();

  try {
    const schemaSql = readFileSync(SCHEMA_SQL_PATH, 'utf8');
    const seedSql = readFileSync(SEED_SQL_PATH, 'utf8');

    await client.query(schemaSql);
    await client.query(seedSql);
  } finally {
    await client.end();
  }
}

/**
 * Creates the admin user (or updates the password of a matching
 * existing one - by email then by username, mirroring
 * SetupWizard::createConfigFile()'s "may already exist" handling), then
 * upserts the same 4 preferences the browser wizard sets to mark the
 * user an approved, verified administrator.
 *
 * The password hash uses bcryptjs, matching PHP's
 * password_hash($password, PASSWORD_DEFAULT) (currently bcrypt) -
 * verified end-to-end against the real PHP app's password_verify(),
 * see the phase 5 doc's verification section.
 */
export async function upsertAdminUser(config, { wtName, wtUser, wtEmail, wtPass, lang }) {
  const client = new Client(config);

  await client.connect();

  try {
    const passwordHash = bcrypt.hashSync(wtPass, 10);

    const existing = await client.query(
      'SELECT user_id FROM wt_user WHERE email = $1 OR user_name = $2 LIMIT 1',
      [wtEmail, wtUser],
    );

    let userId;

    if (existing.rows.length > 0) {
      userId = existing.rows[0].user_id;

      await client.query('UPDATE wt_user SET password = $1 WHERE user_id = $2', [passwordHash, userId]);
    } else {
      const inserted = await client.query(
        'INSERT INTO wt_user (user_name, real_name, email, password) VALUES ($1, $2, $3, $4) RETURNING user_id',
        [wtUser, wtName, wtEmail, passwordHash],
      );

      userId = inserted.rows[0].user_id;
    }

    const preferences = ADMIN_PREFERENCES(lang);

    for (const [settingName, settingValue] of Object.entries(preferences)) {
      await client.query(
        `INSERT INTO wt_user_setting (user_id, setting_name, setting_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
        [userId, settingName, settingValue],
      );
    }

    return userId;
  } finally {
    await client.end();
  }
}
