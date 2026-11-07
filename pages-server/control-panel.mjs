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

// Data/logic layer for /admin (ControlPanel) - the entry point into
// the ~85-route admin area (phase 5 step 39), scoped (per the user's
// own choice) to the read-only dashboard itself: every card's real
// counts/lists, full fidelity on the Modules card's 18-way category
// breakdown (see lib/module-categories.js), with every LINK a real
// link - most still falling through the proxy to PHP, same strangler-
// fig pattern as the genealogy menu (step 33) linking to not-yet-
// ported charts/lists.
//
// Three services are deliberately scope-cut, documented here rather
// than silently faked:
//
//   - ServerCheckService (PHP version/extension/opcache checks): these
//     are checks on the PHP RUNTIME specifically (memory_limit,
//     required extensions, etc.) - meaningless for a request this
//     Node server itself is now serving, and moot as PHP phases out.
//     Always returns no errors/warnings.
//   - UpgradeService (a live HTTP call to webtrees.net for the latest
//     released version): no network dependency has been introduced
//     anywhere else in this migration, and checking "is PHP itself
//     outdated" has no bearing on a Node-served page. Always renders
//     the "no upgrade information is available" branch.
//   - HousekeepingService::deleteOldWebtreesFiles(): real PHP actually
//     DELETES a hardcoded list of ~70 legacy (webtrees 1.x/2.x) file/
//     folder names from the install root on EVERY page load, and
//     reports back whichever ones it couldn't remove. Running a
//     delete loop against the application's own checkout on every GET
//     is exactly the kind of destructive action this migration's own
//     operating principles call for avoiding without explicit need -
//     ported as a READ-ONLY existence check instead (same list, same
//     banner if any are found, but nothing is ever deleted here).

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { MODULE_CATEGORIES } from '../lib/module-categories.js';

// Mirrors HousekeepingService::OLD_PATHS (app/Services/HousekeepingService.php:39-120) -
// copied verbatim (comments trimmed). See this file's own top doc
// comment for why this port only CHECKS existence, never deletes.
export const OLD_PATHS = [
  'themechange.php', 'addremotelink.php', 'addsearchlink.php', 'client.php', 'dir_editor.php',
  'editconfig_gedcom.php', 'editgedcoms.php', 'edit_merge.php', 'edit_news.php', 'genservice.php',
  'logs.php', 'manageservers.php', 'media.php', 'module_admin.php', 'opensearch.php', 'PEAR.php',
  'pgv_to_wt.php', 'places', 'serviceClientTest.php', 'siteconfig.php', 'SOAP', 'uploadmedia.php',
  'useradmin.php', 'webservice', 'wtinfo.php', 'treenav.php', 'modules_v2', 'search_engine.php',
  'sidebar.php', 'login_register.php', 'admin_site_ipaddress.php', 'downloadgedcom.php',
  'export_gedcom.php', 'gedcheck.php', 'images', 'imageflush.php', '/lightbox/js/tip_balloon_RTL.js',
  'imageview.php', 'media/MediaInfo.txt', 'media/thumbs/ThumbsInfo.txt', 'readme.html',
  'downloadbackup.php', 'site-php-version.php', 'admin_site_other.php', 'js', 'library', 'save.php',
  'assets/js-1.7.0', 'assets/js-1.7.2', 'assets/js-1.7.4', 'action.php', 'addmedia.php', 'addmin.php',
  'admin_media.php', 'admin_media_upload.php', 'admin_module_blocks.php', 'admin_module_charts.php',
  'admin_module_menus.php', 'admin_module_reports.php', 'admin_module_sidebar.php', 'admin_module_tabs.php',
];

/**
 * @param {string} rootDir the webtrees install root (real PHP's own Webtrees::ROOT_DIR)
 * @returns {Promise<string[]>} the subset of OLD_PATHS that still exist
 */
export async function findOldWebtreesFiles(rootDir) {
  const found = [];

  for (const relativePath of OLD_PATHS) {
    try {
      await stat(path.join(rootDir, relativePath));
      found.push(relativePath);
    } catch {
      // Doesn't exist - already "clean", matching real PHP's own
      // deleteFileOrFolder() treating "nothing to delete" as success.
    }
  }

  return found;
}

/**
 * Mirrors the four `leftJoin('gedcom')...groupBy...pluck` count
 * queries in ControlPanel.php (totalIndividuals/totalFamilies/
 * totalSources/totalMediaObjects), generalized over the table/column
 * pair - every one of those four methods differs only in that pair.
 *
 * @param {import('pg').Pool} pool
 * @param {string} table
 * @param {string} fileColumn
 * @param {string} idColumn
 * @returns {Promise<Map<number, number>>} gedcom_id -> count, including 0 for a tree with none
 */
async function countByTree(pool, table, fileColumn, idColumn) {
  const result = await pool.query(
    `SELECT gedcom.gedcom_id, COUNT(t.${idColumn}) AS total
       FROM wt_gedcom gedcom
       LEFT JOIN ${table} t ON t.${fileColumn} = gedcom.gedcom_id
      WHERE gedcom.gedcom_id > 0
      GROUP BY gedcom.gedcom_id`,
  );

  return new Map(result.rows.map((row) => [row.gedcom_id, parseInt(row.total, 10)]));
}

export async function totalIndividualsByTree(pool) {
  return countByTree(pool, 'wt_individuals', 'i_file', 'i_id');
}

export async function totalFamiliesByTree(pool) {
  return countByTree(pool, 'wt_families', 'f_file', 'f_id');
}

export async function totalSourcesByTree(pool) {
  return countByTree(pool, 'wt_sources', 's_file', 's_id');
}

export async function totalMediaByTree(pool) {
  return countByTree(pool, 'wt_media', 'm_file', 'm_id');
}

/**
 * Mirrors totalRepositories()/totalNotes()/totalSubmitters() - same
 * shape as countByTree() above, but counting `wt_other` rows of one
 * `o_type` ('REPO'/'NOTE'/'SUBM') instead of a dedicated table.
 */
async function countOtherByTree(pool, recordType) {
  const result = await pool.query(
    `SELECT gedcom.gedcom_id, COUNT(o.o_id) AS total
       FROM wt_gedcom gedcom
       LEFT JOIN wt_other o ON o.o_file = gedcom.gedcom_id AND o.o_type = $1
      WHERE gedcom.gedcom_id > 0
      GROUP BY gedcom.gedcom_id`,
    [recordType],
  );

  return new Map(result.rows.map((row) => [row.gedcom_id, parseInt(row.total, 10)]));
}

export async function totalRepositoriesByTree(pool) {
  return countOtherByTree(pool, 'REPO');
}

export async function totalNotesByTree(pool) {
  return countOtherByTree(pool, 'NOTE');
}

export async function totalSubmittersByTree(pool) {
  return countOtherByTree(pool, 'SUBM');
}

/**
 * Mirrors totalChanges() - counts PENDING changes only, per tree.
 */
export async function totalChangesByTree(pool) {
  const result = await pool.query(
    `SELECT gedcom.gedcom_id, COUNT(c.change_id) AS total
       FROM wt_gedcom gedcom
       LEFT JOIN wt_change c ON c.gedcom_id = gedcom.gedcom_id AND c.status = 'pending'
      WHERE gedcom.gedcom_id > 0
      GROUP BY gedcom.gedcom_id`,
  );

  return new Map(result.rows.map((row) => [row.gedcom_id, parseInt(row.total, 10)]));
}

function mapUserRow(row) {
  return { userId: row.user_id, userName: row.user_name, realName: row.real_name, email: row.email };
}

/**
 * Mirrors UserService::all() (app/Services/UserService.php:148-155).
 */
export async function loadAllUsers(pool) {
  const result = await pool.query('SELECT user_id, user_name, real_name, email FROM wt_user WHERE user_id > 0 ORDER BY real_name');
  return result.rows.map(mapUserRow);
}

/**
 * Mirrors UserService::administrators().
 */
export async function loadAdministrators(pool) {
  const result = await pool.query(
    `SELECT u.user_id, u.user_name, u.real_name, u.email
       FROM wt_user u
       JOIN wt_user_setting us ON us.user_id = u.user_id
      WHERE us.setting_name = 'canadmin' AND us.setting_value = '1' AND u.user_id > 0
      ORDER BY u.real_name`,
  );
  return result.rows.map(mapUserRow);
}

/**
 * Mirrors UserService::managers()/moderators() - same shape, only the
 * target `setting_value` ('admin' vs. 'accept') differs.
 */
async function loadUsersByTreeRole(pool, roleValue) {
  const result = await pool.query(
    `SELECT DISTINCT u.user_id, u.user_name, u.real_name, u.email
       FROM wt_user u
       JOIN wt_user_gedcom_setting ugs ON ugs.user_id = u.user_id
      WHERE ugs.setting_name = 'canedit' AND ugs.setting_value = $1 AND u.user_id > 0
      ORDER BY u.real_name`,
    [roleValue],
  );
  return result.rows.map(mapUserRow);
}

export async function loadManagers(pool) {
  return loadUsersByTreeRole(pool, 'admin');
}

export async function loadModerators(pool) {
  return loadUsersByTreeRole(pool, 'accept');
}

/**
 * Mirrors UserService::unapproved()/unverified() - a user with no
 * setting row at all counts as "not yet", matching the real LEFT
 * JOIN + "<> '1' OR NULL" predicate exactly.
 */
async function loadUsersMissingFlag(pool, settingName) {
  const result = await pool.query(
    `SELECT u.user_id, u.user_name, u.real_name, u.email
       FROM wt_user u
       LEFT JOIN wt_user_setting us ON us.user_id = u.user_id AND us.setting_name = $1
      WHERE (us.setting_value <> '1' OR us.setting_value IS NULL) AND u.user_id > 0
      ORDER BY u.real_name`,
    [settingName],
  );
  return result.rows.map(mapUserRow);
}

export async function loadUnapproved(pool) {
  return loadUsersMissingFlag(pool, 'verified_by_admin');
}

export async function loadUnverified(pool) {
  return loadUsersMissingFlag(pool, 'verified');
}

// ModuleListTrait's own real ROUTE_URLs - same table genealogy-menu.mjs's
// own LIST_ENTRIES uses, for the same 7 list modules the family-trees
// table links each count to (branches_list has no column here - real
// PHP's own ControlPanel.php never queries it either).
const LIST_MODULE_URLS = {
  individual_list: (t) => `/tree/${t}/individual-list`,
  family_list: (t) => `/tree/${t}/family-list`,
  source_list: (t) => `/tree/${t}/source-list`,
  repository_list: (t) => `/tree/${t}/repository-list`,
  media_list: (t) => `/tree/${t}/media-list`,
  note_list: (t) => `/tree/${t}/note-list`,
  submitter_list: (t) => `/tree/${t}/submitter-list`,
};

/**
 * Mirrors ControlPanel.php's own `$x_list_module instanceof Y` checks -
 * findByInterface() with no $include_disabled argument defaults to
 * enabled-only, so a disabled list module (e.g. this migration's own
 * "ophir" tree has `submitter_list` disabled) means that column shows
 * a plain number, no link.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string, (treeName: string) => string|null>>}
 */
export async function loadListModuleUrls(pool) {
  const moduleNames = Object.keys(LIST_MODULE_URLS);
  const result = await pool.query(`SELECT module_name, status FROM wt_module WHERE module_name = ANY($1)`, [moduleNames]);
  const enabled = new Set(result.rows.filter((row) => row.status === 'enabled').map((row) => row.module_name));

  const urls = {};
  for (const [moduleName, urlFn] of Object.entries(LIST_MODULE_URLS)) {
    urls[moduleName] = enabled.has(moduleName) ? urlFn : () => null;
  }
  return urls;
}

/**
 * Mirrors MessageService::recipientTypes() (app/Services/MessageService.php:184-191) -
 * a static list, English only (no I18N layer in this migration).
 */
export function recipientTypes() {
  return [
    { to: 'all', label: 'Send a message to all users' },
    { to: 'never_logged_in', label: 'Send a message to users who have never signed in' },
    { to: 'last_6mo', label: 'Send a message to users who have not signed in for 6 months' },
  ];
}

/**
 * English titles for the handful of "other" (no ModuleXInterface at
 * all) core modules - read directly from each module's own title()
 * method rather than guessed, since there's no generic way to resolve
 * a translated string via Reflection alone.
 */
export const OTHER_MODULE_TITLES = {
  GEDFact_assistant: 'Census assistant',
  'check-for-new-version': 'Check for new version',
  ckeditor: 'CKEditor™',
  'custom-css-js': 'CSS and JS',
  'legacy-urls': 'Legacy URLs',
  sitemap: 'Sitemaps',
};

/**
 * Mirrors ModuleService::otherModules()/all()'s category counting -
 * for every category key MODULE_CATEGORIES uses, how many of this
 * tree's real modules (per `wt_module.status`) are enabled vs. total.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{counts: Record<string, {enabled: number, total: number}>, otherModules: Array<{name: string, title: string, enabled: boolean}>, deletedModules: string[], allEnabled: number, allTotal: number}>}
 */
export async function loadModuleSummary(pool) {
  const result = await pool.query('SELECT module_name, status FROM wt_module');
  const statusByName = new Map(result.rows.map((row) => [row.module_name, row.status === 'enabled']));

  const counts = {};
  let allEnabled = 0;
  let allTotal = 0;
  const otherModules = [];

  for (const [moduleName, categories] of Object.entries(MODULE_CATEGORIES)) {
    const enabled = statusByName.get(moduleName) ?? false;
    // A module not present in wt_module at all (shouldn't happen for
    // a core module, but mirrors deletedModules()'s own "disk vs DB"
    // framing) is simply absent from every count, same as real PHP's
    // own findByInterface() only ever iterating modules it CAN load.
    if (!statusByName.has(moduleName)) {
      continue;
    }

    allTotal += 1;
    if (enabled) {
      allEnabled += 1;
    }

    for (const category of categories) {
      counts[category] ??= { enabled: 0, total: 0 };
      counts[category].total += 1;
      if (enabled) {
        counts[category].enabled += 1;
      }
    }

    if (categories.includes('other')) {
      otherModules.push({ name: moduleName, title: OTHER_MODULE_TITLES[moduleName] ?? moduleName, enabled });
    }
  }

  const knownNames = new Set(Object.keys(MODULE_CATEGORIES));
  const deletedModules = result.rows.map((row) => row.module_name).filter((name) => !knownNames.has(name));

  return { counts, otherModules, deletedModules, allEnabled, allTotal };
}
