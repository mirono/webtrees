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

// Mirrors app/Services/TreeService.php::all()'s privacy-filtering
// query exactly (app/Services/TreeService.php:72-113) - this is
// security-sensitive (which trees a user is even allowed to know
// exist), so it's replicated precisely rather than approximated.
// 'canedit' is wt_user_gedcom_setting's real setting_name for a
// user's per-tree role (UserInterface::PREF_TREE_ROLE); 'admin' means
// tree manager, 'none' means visitor (UserInterface::ROLE_MANAGER /
// ROLE_VISITOR - confirmed against app/Contracts/UserInterface.php,
// not guessed from the PHP constant names).
//
// For an anonymous visitor (userId === null), the LEFT JOIN's
// `ugs.user_id = $1` condition can never match any real row (SQL NULL
// comparison), so only the "public, imported" branch can ever apply -
// exactly mirroring Auth::id() being null for a guest in the PHP
// query this replicates.

/**
 * @param {import('pg').Pool} pool
 * @param {{userId: number|null, isAdmin: boolean}} params
 * @returns {Promise<Array<{gedcomId: number, name: string, imported: boolean, private: boolean}>>}
 */
export async function accessibleTrees(pool, { userId, isAdmin }) {
  if (isAdmin) {
    const result = await pool.query(
      'SELECT gedcom_id, gedcom_name, title, imported, private FROM wt_gedcom WHERE gedcom_id > 0 ORDER BY sort_order, title',
    );

    return result.rows.map(mapRow);
  }

  const result = await pool.query(
    `SELECT gedcom.gedcom_id, gedcom.gedcom_name, gedcom.title, gedcom.imported, gedcom.private
     FROM wt_gedcom gedcom
     LEFT JOIN wt_user_gedcom_setting ugs
       ON ugs.gedcom_id = gedcom.gedcom_id AND ugs.user_id = $1 AND ugs.setting_name = 'canedit'
     WHERE gedcom.gedcom_id > 0
       AND (
         ugs.setting_value = 'admin'
         OR (gedcom.imported = 1 AND gedcom.private = 1 AND ugs.setting_value <> 'none')
         OR (gedcom.imported = 1 AND gedcom.private = 0)
       )
     ORDER BY gedcom.sort_order, gedcom.title`,
    [userId],
  );

  return result.rows.map(mapRow);
}

/**
 * Single-tree-by-name lookup, replicating
 * app/Http/Middleware/Router.php:112-125's own tree resolution -
 * TreeService::all()->get($name) using the EXACT SAME privacy
 * predicate as accessibleTrees() above, scoped to one row instead of
 * a full list. Returns null for BOTH "no tree with this name" and
 * "tree exists but isn't accessible to this viewer" - confirmed live
 * that PHP itself makes no distinction between the two (both fall
 * through to the same NotFound handler, which redirects home for a
 * normal GET) - see docs/php-to-js-migration/phase5-tree-page.md.
 *
 * @param {import('pg').Pool} pool
 * @param {string} name the {tree} URL segment - wt_gedcom.gedcom_name
 * @param {{userId: number|null, isAdmin: boolean}} params
 * @returns {Promise<{gedcomId: number, name: string, title: string, imported: boolean, private: boolean}|null>}
 */
export async function accessibleTreeByName(pool, name, { userId, isAdmin }) {
  if (isAdmin) {
    const result = await pool.query(
      'SELECT gedcom_id, gedcom_name, title, imported, private FROM wt_gedcom WHERE gedcom_id > 0 AND gedcom_name = $1',
      [name],
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  const result = await pool.query(
    `SELECT gedcom.gedcom_id, gedcom.gedcom_name, gedcom.title, gedcom.imported, gedcom.private
     FROM wt_gedcom gedcom
     LEFT JOIN wt_user_gedcom_setting ugs
       ON ugs.gedcom_id = gedcom.gedcom_id AND ugs.user_id = $1 AND ugs.setting_name = 'canedit'
     WHERE gedcom.gedcom_id > 0
       AND gedcom.gedcom_name = $2
       AND (
         ugs.setting_value = 'admin'
         OR (gedcom.imported = 1 AND gedcom.private = 1 AND ugs.setting_value <> 'none')
         OR (gedcom.imported = 1 AND gedcom.private = 0)
       )`,
    [userId, name],
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

function mapRow(row) {
  return {
    gedcomId: row.gedcom_id,
    name: row.gedcom_name,
    title: row.title,
    imported: row.imported === 1,
    private: row.private === 1,
  };
}

/**
 * The viewer's tri-state access level for a tree, mirroring
 * Auth::accessLevel()'s tiers: 0 = manager, 1 = member, 2 = visitor -
 * lower is MORE privileged, matching PHP's own inverted numbering
 * (Auth::PRIV_NONE=0/PRIV_USER=1/PRIV_PRIVATE=2).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, userId: number|null, isAdmin: boolean}} params
 * @returns {Promise<0|1|2>}
 */
export async function viewerAccessLevel(pool, { gedcomId, userId, isAdmin }) {
  if (isAdmin) {
    return 0;
  }

  if (userId === null) {
    return 2;
  }

  const result = await pool.query(
    "SELECT setting_value FROM wt_user_gedcom_setting WHERE gedcom_id = $1 AND user_id = $2 AND setting_name = 'canedit'",
    [gedcomId, userId],
  );
  const value = result.rows[0]?.setting_value;

  if (value === 'admin') {
    return 0;
  }

  if (value !== undefined && value !== 'none') {
    return 1;
  }

  return 2;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, userId: number|null, isAdmin: boolean}} params
 * @returns {Promise<boolean>}
 */
export async function isTreeManager(pool, { gedcomId, userId, isAdmin }) {
  if (isAdmin) {
    return true;
  }

  const result = await pool.query(
    "SELECT 1 FROM wt_user_gedcom_setting WHERE gedcom_id = $1 AND user_id = $2 AND setting_name = 'canedit' AND setting_value = 'admin'",
    [gedcomId, userId],
  );

  return result.rows.length > 0;
}
