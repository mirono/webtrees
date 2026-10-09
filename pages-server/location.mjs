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

// Data/logic layer for /tree/{tree}/location-list (LocationListModule) - the
// fourth "list" route this migration has ported, and the first to reuse a
// data module from another record type: imports recordLastChange from
// source.mjs rather than duplicating it. Location storage and privacy
// follow the exact same patterns as Repository: shared wt_other table
// (o_type = '_LOC'), base GedcomRecord::canShowByType() only (no
// override in app/Location.php), and member-only access level
// (Auth::PRIV_USER = 1). See docs/php-to-js-migration/phase5-location-list.md.

import { canShowViaResnChain } from './individual.mjs';
import { recordLastChange, loadShowLastChangePref } from './source.mjs';

// Base GedcomRecord::canShowByType() for record types without an override
// (same as used by Repository and Source): PUBLIC unless a tree-wide
// wt_default_resn row exists for this record type.
function defaultRecordCanShow(treeFactResn, recordType, viewer) {
  const resn = treeFactResn.get(recordType) ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

/**
 * Locations live in the generic wt_other table, discriminated by
 * `o_type = '_LOC'` (same pattern as Repository).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadLocation(pool, gedcomId, xref) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2 AND o_type = '_LOC'", [
    xref,
    gedcomId,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].o_id, gedcom: result.rows[0].o_gedcom };
}

/**
 * Every location in the tree, ordered by xref - same "no explicit
 * ORDER BY, DataTables sorts client-side" reasoning as loadRepositoryList().
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{xref: string, gedcom: string}[]>}
 */
export async function loadLocationList(pool, gedcomId) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_file = $1 AND o_type = '_LOC' ORDER BY o_id", [
    gedcomId,
  ]);

  return result.rows.map((row) => ({ xref: row.o_id, gedcom: row.o_gedcom }));
}

/**
 * Mirrors resources/views/lists/locations-table.phtml's own
 * `$count_individuals` query - a grouped count of every _LOC-citing
 * wt_link row per location, joined to wt_individuals, deliberately
 * NOT privacy-filtered (same acknowledged shortcut as repositorySourceCounts()).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function locationIndividualCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_individuals
     JOIN wt_link ON l_from = i_id AND l_file = i_file
     WHERE l_type = '_LOC' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors locations-table.phtml's `$count_families` query - same shape as
 * locationIndividualCounts() above, joined to wt_families instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function locationFamilyCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_families
     JOIN wt_link ON l_from = f_id AND l_file = f_file
     WHERE l_type = '_LOC' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors Location's privacy (no override - base
 * GedcomRecord::canShowByType() only) via the shared RESN chain.
 *
 * @param {{defaultResn: string|null}} tree individual-scoped default-resn
 *   info for THIS location's own xref (loadDefaultResn(), reused as-is)
 * @param {string} gedcom the location's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from the SAME loadDefaultResn() call
 * @returns {boolean}
 */
export function locationCanShowRecord(tree, gedcom, viewer, treeFactResn) {
  return canShowViaResnChain(tree, gedcom, viewer, () => defaultRecordCanShow(treeFactResn, '_LOC', viewer));
}

// Re-export from source.mjs so callers don't need to import multiple modules
export { recordLastChange, loadShowLastChangePref };
