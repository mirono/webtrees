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

// Flag parsing for setup-cli/, via Node's built-in node:util.parseArgs —
// no argument-parsing dependency needed. Flag names mirror
// app/Cli/Commands/ConfigIni.php's naming (dbhost/dbport/tblpfx/base-url
// etc.) where they overlap.
//
// Deliberately NO `default` values here (other than --help): the whole
// point of setup-cli/ is that running it with no flags at all walks you
// through the same steps as the browser wizard, starting with language
// - a `default` on a parseArgs option makes that field always defined,
// which would silently skip its prompt even when you never passed the
// flag. Suggested defaults (5432, "wt_", "en-US", etc.) are shown inside
// the prompts themselves instead (see index.mjs's step functions) -
// press enter to accept them, or type a flag to skip the prompt
// entirely for scripted/CI use.

import { parseArgs } from 'node:util';

const OPTIONS = {
  lang: { type: 'string' },
  'db-host': { type: 'string' },
  'db-port': { type: 'string' },
  'db-user': { type: 'string' },
  'db-pass': { type: 'string' },
  'db-name': { type: 'string' },
  tblpfx: { type: 'string' },
  'base-url': { type: 'string' },
  'rewrite-urls': { type: 'boolean' },
  'wt-name': { type: 'string' },
  'wt-user': { type: 'string' },
  'wt-pass': { type: 'string' },
  'wt-email': { type: 'string' },
  help: { type: 'boolean', default: false, short: 'h' },
};

export function parseCliArgs(argv) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true });

  return values;
}

export function printHelp() {
  console.log(`Usage: node setup-cli/index.mjs [options]

Provisions a fresh PostgreSQL-backed webtrees install: creates the
database (if it doesn't already exist), the schema, default seed data,
and an admin user, then writes data/config.yaml. Walks through the same
steps as the browser setup wizard (language, server checks, database
type, database connection, administrator, install) - run it with no
options at all and it will prompt for everything, one step at a time.

Only PostgreSQL is supported. Only the "wt_" table prefix is supported.
Assumes the given database user/role already exists with adequate
privileges (at least CREATEDB, to create the target database itself).

Any option below lets you skip that step's prompt, for scripted/CI use
- e.g. \`node setup-cli/index.mjs --lang=en-US\` skips only the language
prompt, everything else still prompts as normal. --db-pass/--wt-pass
also fall back to the WT_DB_PASSWORD/WT_ADMIN_PASSWORD environment
variables before prompting - prefer those or the prompt over passing
passwords as plain flags (shell history, ps output, CI logs).

Options:
  --lang <tag>            Admin's language tag, e.g. en-US
  --db-host <host>        PostgreSQL host
  --db-port <port>        PostgreSQL port
  --db-user <user>        PostgreSQL user/role
  --db-pass <password>    PostgreSQL password (prefer WT_DB_PASSWORD env var)
  --db-name <name>        Database name to create/use
  --tblpfx <prefix>       Table prefix (only supported value: wt_)
  --base-url <url>        Site base URL, e.g. http://localhost:8000
  --rewrite-urls          Use pretty URLs
  --wt-name <name>        Administrator's real name
  --wt-user <username>    Administrator's username
  --wt-pass <password>    Administrator's password (prefer WT_ADMIN_PASSWORD env var)
  --wt-email <email>      Administrator's email address
  -h, --help              Show this help
`);
}
