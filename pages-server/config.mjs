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

// Reads data/config.yaml - the same file setup-cli/ writes and PHP's
// Webtrees::readConfig() reads - to get the DB connection this server
// should share with the PHP app.
//
// This is a small, targeted parser for exactly the one flat shape
// setup-cli/config-writer.mjs ever produces (`key: "value"` lines, with
// `\"`/`\\` as the only escapes), not a general YAML parser - a real
// YAML library would be needed to read arbitrary YAML, but this file is
// only ever written by our own setup-cli/, so a full parser would be
// solving a problem this codebase doesn't have.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_YAML_PATH = path.join(REPO_ROOT, 'data', 'config.yaml');

const LINE_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*):\s*"((?:[^"\\]|\\.)*)"\s*$/;

function readRawConfig() {
  const raw = readFileSync(CONFIG_YAML_PATH, 'utf8');
  const config = {};

  for (const line of raw.split('\n')) {
    const match = LINE_PATTERN.exec(line);

    if (match === null) {
      continue;
    }

    const [, key, rawValue] = match;

    config[key] = rawValue.replaceAll(/\\(.)/g, '$1');
  }

  return config;
}

/**
 * @returns {{host: string, port: number, user: string, password: string, database: string}}
 */
export function loadDbConfig() {
  const config = readRawConfig();

  if (config.dbtype !== 'pgsql') {
    throw new Error(
      `pages-server only supports a Postgres-backed install (data/config.yaml has dbtype="${config.dbtype}"). ` +
        'Run setup-cli/ first - see docs/php-to-js-migration/phase5-postgres-setup-cli.md.',
    );
  }

  return {
    host: config.dbhost,
    port: Number(config.dbport),
    user: config.dbuser,
    password: config.dbpass,
    database: config.dbname,
  };
}

/**
 * The subset of config.yaml the home-page redirect logic needs to
 * build PHP-compatible URLs, mirroring app/Factories/RouteFactory.php's
 * own base_url/rewrite_urls handling.
 *
 * @returns {{baseUrl: string, rewriteUrls: boolean}}
 */
export function loadSiteUrlConfig() {
  const config = readRawConfig();

  return {
    baseUrl: config.base_url ?? '',
    rewriteUrls: config.rewrite_urls === '1',
  };
}
