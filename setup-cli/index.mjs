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

// Provisions a fresh PostgreSQL-backed webtrees install end to end:
// creates the database, schema, seed data, and an admin user, then
// writes data/config.yaml. See
// docs/php-to-js-migration/phase5-postgres-setup-cli.md for the full
// design and its known limits (Postgres-only, "wt_"-only table prefix,
// fresh-installs-oriented). Run with `npm run setup -- [options]` or
// `node setup-cli/index.mjs [options]` - see --help for all options.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCliArgs, printHelp } from './args.mjs';
import { promptText, promptPassword } from './prompt.mjs';
import { ensureDatabase, runSchemaAndSeed, upsertAdminUser } from './pg.mjs';
import { renderConfigYaml } from './config-writer.mjs';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_YAML_PATH = path.join(REPO_ROOT, 'data', 'config.yaml');

const SUPPORTED_PREFIX = 'wt_';

async function resolveValue(flagValue, envVarName, question, { password = false, defaultValue } = {}) {
  if (flagValue !== undefined) {
    return flagValue;
  }

  if (envVarName && process.env[envVarName]) {
    return process.env[envVarName];
  }

  return password ? promptPassword(question) : promptText(question, defaultValue);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.tblpfx !== SUPPORTED_PREFIX) {
    console.error(
      `Only the "${SUPPORTED_PREFIX}" table prefix is supported in this tool (got "${args.tblpfx}"). ` +
        'A custom prefix would need the golden schema SQL to be re-generated with matching identifiers - ' +
        'see docs/php-to-js-migration/phase5-postgres-setup-cli.md.',
    );
    process.exitCode = 1;
    return;
  }

  const dbHost = await resolveValue(args['db-host'], undefined, 'PostgreSQL host', { defaultValue: 'localhost' });
  const dbPort = await resolveValue(args['db-port'], undefined, 'PostgreSQL port', { defaultValue: '5432' });
  const dbUser = await resolveValue(args['db-user'], undefined, 'PostgreSQL user');
  const dbPass = await resolveValue(args['db-pass'], 'WT_DB_PASSWORD', 'PostgreSQL password', { password: true });
  const dbName = await resolveValue(args['db-name'], undefined, 'Database name');
  const baseUrl = await resolveValue(args['base-url'], undefined, 'Site base URL (e.g. http://localhost:8000)');
  const wtName = await resolveValue(args['wt-name'], undefined, "Administrator's real name");
  const wtUser = await resolveValue(args['wt-user'], undefined, "Administrator's username");
  const wtEmail = await resolveValue(args['wt-email'], undefined, "Administrator's email address");
  const wtPass = await resolveValue(args['wt-pass'], 'WT_ADMIN_PASSWORD', "Administrator's password", { password: true });
  const lang = args.lang;
  const rewriteUrls = args['rewrite-urls'];

  const dbConfig = { host: dbHost, port: Number(dbPort), user: dbUser, password: dbPass, database: dbName };

  console.log(`Connecting to PostgreSQL at ${dbHost}:${dbPort} as ${dbUser}...`);
  await ensureDatabase(dbConfig);

  console.log('Creating schema and seed data...');
  await runSchemaAndSeed(dbConfig);

  console.log(`Creating administrator user "${wtUser}"...`);
  await upsertAdminUser(dbConfig, { wtName, wtUser, wtEmail, wtPass, lang });

  console.log(`Writing ${CONFIG_YAML_PATH}...`);
  const configYaml = renderConfigYaml({
    dbtype: 'pgsql',
    dbhost: dbHost,
    dbport: String(dbPort),
    dbuser: dbUser,
    dbpass: dbPass,
    dbname: dbName,
    tblpfx: SUPPORTED_PREFIX,
    base_url: baseUrl.replace(/\/+$/, ''),
    rewrite_urls: rewriteUrls ? '1' : '0',
  });

  writeFileSync(CONFIG_YAML_PATH, configYaml, { encoding: 'utf8', mode: 0o600 });

  console.log('');
  console.log(`Done. webtrees is configured at ${baseUrl}`);
  console.log(`Log in with username "${wtUser}" and the password you entered.`);
  console.log('(There is no way to auto-login from a CLI, unlike the browser wizard - log in through the web UI.)');
}

main().catch((error) => {
  console.error('Setup failed:', error.message ?? error);
  process.exitCode = 1;
});
