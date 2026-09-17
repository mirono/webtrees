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

// Writes data/config.yaml. Hand-rolled instead of pulling in a YAML
// library: this CLI only ever writes a flat, single-level string map -
// no nesting, no lists, no multiline values - so a serializer that
// double-quotes every scalar and escapes '"'/'\' is fully correct for
// this exact shape. See app/Webtrees.php::readConfig() for the PHP side
// that reads this file back (Symfony's Yaml component, a real
// dependency there since parsing arbitrary YAML back is a different,
// harder problem than emitting this one flat shape).

function quote(value) {
  return '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
}

/**
 * @param {Record<string, string>} config
 */
export function renderConfigYaml(config) {
  return Object.entries(config)
    .map(([key, value]) => `${key}: ${quote(value)}`)
    .join('\n') + '\n';
}
