#!/usr/bin/env node

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

// Provisions a fresh PostgreSQL-backed webtrees install end to end,
// walking through the same steps as the browser setup wizard
// (app/Http/RequestHandlers/SetupWizard.php: language, server checks,
// database type, database connection, administrator, install) - run
// with no arguments at all and it prompts for every step, one at a
// time, exactly like the browser wizard's multi-page flow. Any value
// can be pre-supplied as a flag (see --help) to skip just that one
// prompt, e.g. for scripted/CI use, but that's the exception, not the
// expected way to run this.
//
// See docs/php-to-js-migration/phase5-postgres-setup-cli.md for the
// full design and its known limits (Postgres-only, "wt_"-only table
// prefix, fresh-installs-oriented).

import { writeFileSync, accessSync, constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCliArgs, printHelp } from './args.mjs';
import { promptText, promptPassword, promptChoice, closePrompt } from './prompt.mjs';
import { ensureDatabase, findExistingWebtreesTables, dropTables, runSchemaAndSeed, upsertAdminUser } from './pg.mjs';
import { renderConfigYaml } from './config-writer.mjs';
import { loadSetupLanguages, findLanguageIndex, DEFAULT_LANGUAGE_TAG } from './languages.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CONFIG_YAML_PATH = path.join(DATA_DIR, 'config.yaml');

const SUPPORTED_PREFIX = 'wt_';
const SUPPORTED_DB_TYPE = 'pgsql';

function stepHeader(n, total, title) {
  console.log(`\n--- Step ${n} of ${total}: ${title} ---`);
}

async function resolveValue(flagValue, envVarName, question, { password = false, defaultValue } = {}) {
  if (flagValue !== undefined) {
    return flagValue;
  }

  if (envVarName && process.env[envVarName]) {
    return process.env[envVarName];
  }

  return password ? promptPassword(question) : promptText(question, defaultValue);
}

async function stepLanguage(args) {
  stepHeader(1, 6, 'Language');

  const languages = loadSetupLanguages();
  const defaultIndex = findLanguageIndex(DEFAULT_LANGUAGE_TAG);

  if (args.lang !== undefined) {
    const index = findLanguageIndex(args.lang);

    if (index === -1) {
      console.error(
        `\n"${args.lang}" is not one of the languages webtrees supports. ` +
          `Supported tags: ${languages.map((language) => language.languageTag).join(', ')}.`,
      );
      process.exit(1);
    }

    return languages[index].languageTag;
  }

  const labels = languages.map((language) => `${language.endonym} (${language.languageTag})`);
  const chosenIndex = await promptChoice('Select language:', labels, defaultIndex);

  return languages[chosenIndex].languageTag;
}

function stepServerCheck() {
  stepHeader(2, 6, 'Server checks');

  const checks = [];

  try {
    accessSync(DATA_DIR, fsConstants.W_OK);
    checks.push(['data/ directory is writable', true]);
  } catch {
    checks.push(['data/ directory is writable', false]);
  }

  checks.push([`Node.js version (${process.version})`, true]);

  for (const [label, ok] of checks) {
    console.log(`  [${ok ? 'ok' : 'FAIL'}] ${label}`);
  }

  if (checks.some(([, ok]) => !ok)) {
    console.error('\nServer checks failed - fix the issue above before continuing.');
    process.exit(1);
  }
}

async function stepDatabaseType(args) {
  stepHeader(3, 6, 'Database type');

  console.log('  PostgreSQL (the only database type this tool supports)');

  const tblpfx = await resolveValue(args.tblpfx, undefined, 'Table prefix', { defaultValue: SUPPORTED_PREFIX });

  if (tblpfx !== SUPPORTED_PREFIX) {
    console.error(
      `\nOnly the "${SUPPORTED_PREFIX}" table prefix is supported in this tool (got "${tblpfx}"). ` +
        'A custom prefix would need the golden schema SQL to be re-generated with matching identifiers - ' +
        'see docs/php-to-js-migration/phase5-postgres-setup-cli.md.',
    );
    process.exit(1);
  }

  return { dbtype: SUPPORTED_DB_TYPE, tblpfx };
}

// A real interactive user can keep retrying indefinitely (same as the
// browser wizard - they can always Ctrl+C). Piped/non-TTY input has a
// finite, already-consumed queue of answers - once it runs out,
// resolveValue() just returns the same empty/default values forever, so
// retrying without a cap spins forever hammering the server with
// connection attempts (this is exactly how "sorry, too many clients
// already" was reproduced: an unreachable server + an uncapped retry
// loop). Cap it whenever stdin isn't a real terminal.
const MAX_CONNECTION_ATTEMPTS = process.stdin.isTTY ? Infinity : 3;

// "localhost"/"127.0.0.1"/"::1" only reach Postgres from wherever THIS
// CLI process itself is running - if webtrees (the PHP app) ends up
// running somewhere else, e.g. the docker-compose "app" container,
// "localhost" means that container, not the host machine or the
// "postgres" container. Confirmed live (2026-09-19): a user provisioned
// via this CLI running directly on the host (where "localhost" is the
// only value that lets the CLI itself connect, since "postgres" isn't
// resolvable outside the Docker network), and the resulting
// data/config.yaml's "localhost" then broke the dockerized app with
// "connection to server at localhost ... Connection refused" - fixed
// by hand-editing dbhost afterward. This is a real, recurring trap
// (this is the third time in this project), not a hypothetical one.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function warnIfLoopbackHost(dbHost) {
  if (!LOOPBACK_HOSTS.has(dbHost)) {
    return;
  }

  console.log(
    `\n  Note: "${dbHost}" only works if THIS CLI itself can reach Postgres directly right now. If webtrees\n` +
      '  will run inside the docker-compose "app" container, that container needs the Postgres service\'s\n' +
      '  Docker network name instead (typically "postgres") - "localhost" inside a container means the\n' +
      '  container itself, not the host machine or another container.\n' +
      '  - Running this CLI on the host (as you are now)? Keep going, but expect to edit dbhost in\n' +
      '    data/config.yaml afterward if webtrees itself runs in Docker.\n' +
      '  - Want to avoid that extra step? Ctrl+C and re-run this CLI from inside the same Docker network\n' +
      '    instead, e.g.: docker compose exec migration node setup-cli/index.mjs - then answer "postgres"\n' +
      '    here and it\'s correct for both this connection and the config file.\n',
  );
}

async function stepDatabaseConnection(args, tblpfx) {
  stepHeader(4, 6, 'Database connection');

  for (let attempt = 1; attempt <= MAX_CONNECTION_ATTEMPTS; attempt++) {
    const dbHost = await resolveValue(args['db-host'], undefined, 'PostgreSQL host', { defaultValue: 'localhost' });

    warnIfLoopbackHost(dbHost);

    const dbPort = await resolveValue(args['db-port'], undefined, 'PostgreSQL port', { defaultValue: '5432' });
    const dbUser = await resolveValue(args['db-user'], undefined, 'PostgreSQL user');
    const dbPass = await resolveValue(args['db-pass'], 'WT_DB_PASSWORD', 'PostgreSQL password', { password: true });
    const dbName = await resolveValue(args['db-name'], undefined, 'Database name');

    const dbConfig = { host: dbHost, port: Number(dbPort), user: dbUser, password: dbPass, database: dbName };

    console.log(`  Connecting to PostgreSQL at ${dbHost}:${dbPort} as ${dbUser}...`);

    try {
      await ensureDatabase(dbConfig);
    } catch (error) {
      console.error(`  Connection failed: ${error.message ?? error}`);

      if (args['db-host'] !== undefined) {
        // Connection details were given as flags, not prompted for -
        // nothing to usefully retry without human input.
        throw error;
      }

      if (attempt === MAX_CONNECTION_ATTEMPTS) {
        throw new Error(`Could not connect after ${attempt} attempts - giving up.`);
      }

      console.log('  Let\'s try again.');
      continue;
    }

    console.log('  Connection successful.');

    // Detect a prior install before step 6 blindly runs the schema SQL,
    // which would otherwise fail partway through with a raw "relation
    // ... already exists" error instead of a clear choice - reported
    // live by a user re-running this CLI against a database from an
    // earlier attempt.
    const existingTables = await findExistingWebtreesTables(dbConfig, tblpfx);

    if (existingTables.length === 0) {
      return dbConfig;
    }

    console.log(
      `  Database "${dbName}" already has ${existingTables.length} webtrees table(s) ` +
        `(e.g. "${existingTables[0]}") - this looks like an existing install.`,
    );

    const overwrite = (
      await promptText('Overwrite it and start fresh? All existing data will be lost. (y/N)', 'N')
    ).toLowerCase().startsWith('y');

    if (overwrite) {
      console.log('  Dropping existing webtrees tables...');
      await dropTables(dbConfig, existingTables);
      return dbConfig;
    }

    if (args['db-host'] !== undefined) {
      // Connection details were given as flags, not prompted for -
      // nothing to usefully retry without human input.
      throw new Error(
        `Database "${dbName}" already has webtrees tables, and the connection details were given as flags, ` +
          'so there is no one to confirm an overwrite with - point --db-name at an empty database instead.',
      );
    }

    console.log('  Keeping it untouched - let\'s connect to a different database instead.\n');

    if (attempt === MAX_CONNECTION_ATTEMPTS) {
      throw new Error(`Gave up after ${attempt} attempts without finding an empty database to install into.`);
    }
  }
}

async function stepAdministrator(args) {
  stepHeader(5, 6, 'Administrator account & site settings');

  const wtName = await resolveValue(args['wt-name'], undefined, "Administrator's real name");
  const wtUser = await resolveValue(args['wt-user'], undefined, "Administrator's username");
  const wtEmail = await resolveValue(args['wt-email'], undefined, "Administrator's email address");
  const wtPass = await resolveValue(args['wt-pass'], 'WT_ADMIN_PASSWORD', "Administrator's password", { password: true });
  const baseUrl = await resolveValue(args['base-url'], undefined, 'Site base URL (e.g. http://localhost:8000)');
  const rewriteUrls =
    args['rewrite-urls'] !== undefined
      ? args['rewrite-urls']
      : (await promptText('Use pretty URLs? (y/N)', 'N')).toLowerCase().startsWith('y');

  return { wtName, wtUser, wtEmail, wtPass, baseUrl: baseUrl.replace(/\/+$/, ''), rewriteUrls };
}

async function stepInstall({ lang, dbTypeInfo, dbConfig, admin }) {
  stepHeader(6, 6, 'Install');

  console.log('  Creating schema and seed data...');
  await runSchemaAndSeed(dbConfig);

  console.log(`  Creating administrator user "${admin.wtUser}"...`);
  await upsertAdminUser(dbConfig, { wtName: admin.wtName, wtUser: admin.wtUser, wtEmail: admin.wtEmail, wtPass: admin.wtPass, lang });

  console.log(`  Writing ${CONFIG_YAML_PATH}...`);
  const configYaml = renderConfigYaml({
    dbtype: dbTypeInfo.dbtype,
    dbhost: dbConfig.host,
    dbport: String(dbConfig.port),
    dbuser: dbConfig.user,
    dbpass: dbConfig.password,
    dbname: dbConfig.database,
    tblpfx: dbTypeInfo.tblpfx,
    base_url: admin.baseUrl,
    rewrite_urls: admin.rewriteUrls ? '1' : '0',
  });

  writeFileSync(CONFIG_YAML_PATH, configYaml, { encoding: 'utf8', mode: 0o600 });

  console.log('');
  console.log(`Done. webtrees is configured at ${admin.baseUrl}`);
  console.log(`Log in with username "${admin.wtUser}" and the password you entered.`);
  console.log('(There is no way to auto-login from a CLI, unlike the browser wizard - log in through the web UI.)');
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  try {
    const lang = await stepLanguage(args);
    stepServerCheck();
    const dbTypeInfo = await stepDatabaseType(args);
    const dbConfig = await stepDatabaseConnection(args, dbTypeInfo.tblpfx);
    const admin = await stepAdministrator(args);

    await stepInstall({ lang, dbTypeInfo, dbConfig, admin });
  } finally {
    closePrompt();
  }
}

main().catch((error) => {
  console.error('Setup failed:', error.message ?? error);
  process.exitCode = 1;
});
