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
// etc.) where they overlap, since that's the existing convention in this
// repo for "configure webtrees from the command line."

import { parseArgs } from 'node:util';

const OPTIONS = {
  'db-host': { type: 'string' },
  'db-port': { type: 'string', default: '5432' },
  'db-user': { type: 'string' },
  'db-pass': { type: 'string' },
  'db-name': { type: 'string' },
  tblpfx: { type: 'string', default: 'wt_' },
  'base-url': { type: 'string' },
  'rewrite-urls': { type: 'boolean', default: false },
  'wt-name': { type: 'string' },
  'wt-user': { type: 'string' },
  'wt-pass': { type: 'string' },
  'wt-email': { type: 'string' },
  lang: { type: 'string', default: 'en-US' },
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
and an admin user, then writes data/config.yaml.

Only PostgreSQL is supported. Only the "wt_" table prefix is supported.
Assumes the given database user/role already exists with adequate
privileges (at least CREATEDB, to create the target database itself).

Any option not given here is prompted for interactively, except
--db-pass/--wt-pass, which fall back to the WT_DB_PASSWORD/
WT_ADMIN_PASSWORD environment variables, then to a masked prompt -
prefer those over passing passwords as plain flags (shell history, ps
output, CI logs).

Options:
  --db-host <host>       PostgreSQL host
  --db-port <port>       PostgreSQL port (default: 5432)
  --db-user <user>       PostgreSQL user/role
  --db-pass <password>   PostgreSQL password (prefer WT_DB_PASSWORD env var)
  --db-name <name>       Database name to create/use
  --tblpfx <prefix>      Table prefix (default and only supported value: wt_)
  --base-url <url>       Site base URL, e.g. http://localhost:8000
  --rewrite-urls         Use pretty URLs (default: off)
  --wt-name <name>       Administrator's real name
  --wt-user <username>   Administrator's username
  --wt-pass <password>   Administrator's password (prefer WT_ADMIN_PASSWORD env var)
  --wt-email <email>     Administrator's email address
  --lang <tag>           Admin's language tag (default: en-US)
  -h, --help             Show this help
`);
}
