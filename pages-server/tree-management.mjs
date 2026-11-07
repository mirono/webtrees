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

// Data layer for /admin/trees... "tree management" (phase 5, tree
// management step). Ports:
//   - ManageTrees (dashboard listing)              -> admin/trees
//   - CreateTreePage/CreateTreeAction               -> admin/trees-create
//   - SelectDefaultTree
//   - DeleteTreeAction                              -> TreeService::delete()
//   - MergeTreesPage/MergeTreesAction
//   - TreePreferencesPage/TreePreferencesAction      -> admin/trees-preferences
//   - RenumberTreePage/RenumberTreeAction
//   - TreePrivacyPage/TreePrivacyAction              -> admin/trees-privacy
//   - CheckTree (reduced scope - see checkTreeErrors doc comment)
//
// Deliberately NOT ported here (two real routes in the original
// 11-route scoping, both cut for the same reason: they depend on
// infrastructure that doesn't exist anywhere in this migration yet,
// not because they're hard to transcribe):
//   - TreePageDefaultEdit/TreePageDefaultUpdate (/admin/trees/default-blocks)
//     needs the full ModuleBlockInterface block-editor framework
//     (shared with per-tree/per-user home-page customization) - never
//     built, belongs with the future "module configuration pages" bucket.
//   - SynchronizeTrees (/admin/trees/sync) internally performs a full
//     GEDCOM import (TreeService::importGedcomFile() + the GEDCOM
//     parser) for every changed file in the data folder - belongs
//     with the future "GEDCOM import/export" bucket.
//
// This migration has no session-based FlashMessages infrastructure
// (confirmed: grep across pages-server/*.mjs finds no flash-write
// helper). Every action here still performs the real redirect/response,
// but the one-line success/error banner PHP shows via
// FlashMessages::addMessage() is not reproduced - a minor, documented
// UX scope cut, not a behavior cut.

// webtrees GEDCOM record-type tags - mirrors each record class's own
// RECORD_TYPE constant (Individual::RECORD_TYPE === 'INDI', etc.).
// No shared gedcom-record-types.mjs module exists in this migration
// yet, so these are declared locally.
const RECORD_TYPE_INDIVIDUAL = 'INDI';
const RECORD_TYPE_FAMILY = 'FAM';
const RECORD_TYPE_SOURCE = 'SOUR';
const RECORD_TYPE_REPOSITORY = 'REPO';
const RECORD_TYPE_NOTE = 'NOTE';
const RECORD_TYPE_MEDIA = 'OBJE';

/**
 * Mirrors Auth::accessLevelNames() exactly (app/Auth.php:449-456).
 * Keys are the real Auth::PRIV_* integer values, NOT array indices -
 * PRIV_PRIVATE(2) really does mean "visible to visitors" in webtrees'
 * inverted numbering (lower number = more privileged viewer required).
 */
export const ACCESS_LEVEL_NAMES = {
  2: 'Show to visitors',
  1: 'Show to members',
  0: 'Show to managers',
  '-1': 'Hide from everyone',
};

/** Mirrors TreePrivacyPage::privacyConstants() (string resn values). */
export const PRIVACY_CONSTANTS = {
  none: 'Show to visitors',
  privacy: 'Show to members',
  confidential: 'Show to managers',
  hidden: 'Hide from everyone',
};

/**
 * AuthManager-equivalent: is this user a manager of AT LEAST ONE
 * tree (or a full admin)? Used to gate the /admin/trees/manage/{tree}
 * dashboard, which (unlike every other /admin/... page this
 * migration has ported so far) only requires AuthManager, not
 * AuthAdministrator.
 *
 * @param {import('pg').Pool} pool
 * @param {{userId: number|null, isAdmin: boolean}} params
 * @returns {Promise<boolean>}
 */
export async function isSiteManager(pool, { userId, isAdmin }) {
  if (isAdmin) {
    return true;
  }

  if (userId === null) {
    return false;
  }

  const result = await pool.query(
    "SELECT 1 FROM wt_user_gedcom_setting WHERE user_id = $1 AND setting_name = 'canedit' AND setting_value = 'admin' LIMIT 1",
    [userId],
  );

  return result.rows.length > 0;
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function isTreeImporting(pool, gedcomId) {
  const result = await pool.query('SELECT 1 FROM wt_gedcom_chunk WHERE gedcom_id = $1 AND imported = false LIMIT 1', [gedcomId]);

  return result.rows.length > 0;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} name
 * @returns {Promise<number|null>}
 */
export async function findTreeIdByName(pool, name) {
  const result = await pool.query('SELECT gedcom_id FROM wt_gedcom WHERE gedcom_name = $1', [name]);

  return result.rows[0] ? result.rows[0].gedcom_id : null;
}

/**
 * Mirrors TreeService::uniqueTreeName() (app/Services/TreeService.php:281-291).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<string>}
 */
export async function uniqueTreeName(pool) {
  let number = 1;

  // eslint-disable-next-line no-await-in-loop
  while ((await findTreeIdByName(pool, `tree${number}`)) !== null) {
    number++;
  }

  return `tree${number}`;
}

/**
 * Mirrors TreeService::create() (app/Services/TreeService.php:141-192)
 * MINUS the two placeholder GEDCOM records it imports (the "0 HEAD"
 * record and the "John /DOE/" placeholder individual) - see this
 * file's top doc comment for why that's cut. `wt_gedcom.imported`
 * keeps its column default of 1 (there is no bulk-import step to set
 * it to 0), which is honest: an empty, never-imported-from-a-file
 * tree is still a validly "imported" (i.e. not mid-import) tree, it
 * just has zero records.
 *
 * @param {import('pg').Pool} pool
 * @param {{name: string, title: string, userId: number}} params
 * @returns {Promise<number>} the new gedcom_id
 */
export async function createTree(pool, { name, title, userId }) {
  const insertResult = await pool.query(
    `INSERT INTO wt_gedcom (gedcom_name, gedcom_filename, title, contact_user_id, support_user_id)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING gedcom_id`,
    [name, `${name}.ged`, title, userId],
  );
  const gedcomId = insertResult.rows[0].gedcom_id;

  await pool.query(
    'INSERT INTO wt_gedcom_setting (gedcom_id, setting_name, setting_value) SELECT $1, setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = -1',
    [gedcomId],
  );
  await pool.query(
    'INSERT INTO wt_default_resn (gedcom_id, tag_type, resn) SELECT $1, tag_type, resn FROM wt_default_resn WHERE gedcom_id = -1',
    [gedcomId],
  );
  // DEFAULT_SURNAME_TRADITIONS is keyed by I18N language tag - this
  // migration is English-only throughout, so it always falls through
  // to the PHP default ('paternal').
  await pool.query("INSERT INTO wt_gedcom_setting (gedcom_id, setting_name, setting_value) VALUES ($1, 'SURNAME_TRADITION', 'paternal')", [
    gedcomId,
  ]);

  return gedcomId;
}

/**
 * Mirrors TreeService::delete() (app/Services/TreeService.php:244-276)
 * exactly, table for table. Transactional - a partial delete would
 * leave an inconsistent tree behind.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<void>}
 */
export async function deleteTreeTransactional(pool, gedcomId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const defaultResult = await client.query("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'DEFAULT_GEDCOM'");
    const nameResult = await client.query('SELECT gedcom_name FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);
    const treeName = nameResult.rows[0]?.gedcom_name ?? null;

    if (defaultResult.rows[0]?.setting_value === treeName) {
      await client.query("UPDATE wt_site_setting SET setting_value = '' WHERE setting_name = 'DEFAULT_GEDCOM'");
    }

    await client.query('DELETE FROM wt_gedcom_chunk WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_individuals WHERE i_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_families WHERE f_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_sources WHERE s_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_other WHERE o_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_places WHERE p_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_placelinks WHERE pl_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_name WHERE n_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_dates WHERE d_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_change WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_link WHERE l_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_media_file WHERE m_file = $1', [gedcomId]);
    await client.query('DELETE FROM wt_media WHERE m_file = $1', [gedcomId]);
    await client.query(
      'DELETE FROM wt_block_setting WHERE block_id IN (SELECT block_id FROM wt_block WHERE gedcom_id = $1)',
      [gedcomId],
    );
    await client.query('DELETE FROM wt_block WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_user_gedcom_setting WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_gedcom_setting WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_module_privacy WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_hit_counter WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_default_resn WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_log WHERE gedcom_id = $1', [gedcomId]);
    await client.query('DELETE FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mirrors SelectDefaultTree (app/Http/RequestHandlers/SelectDefaultTree.php:37-51).
 *
 * @param {import('pg').Pool} pool
 * @param {string} treeName
 * @returns {Promise<void>}
 */
export async function setDefaultTree(pool, treeName) {
  await pool.query(
    "INSERT INTO wt_site_setting (setting_name, setting_value) VALUES ('DEFAULT_GEDCOM', $1) ON CONFLICT (setting_name) DO UPDATE SET setting_value = $1",
    [treeName],
  );
}

const XREF_UNION_TABLES = (gedcomId, params) => [
  { sql: `SELECT xref FROM wt_change WHERE gedcom_id = $${params.push(gedcomId)}` },
  { sql: `SELECT i_id AS xref FROM wt_individuals WHERE i_file = $${params.push(gedcomId)}` },
  { sql: `SELECT f_id AS xref FROM wt_families WHERE f_file = $${params.push(gedcomId)}` },
  { sql: `SELECT s_id AS xref FROM wt_sources WHERE s_file = $${params.push(gedcomId)}` },
  { sql: `SELECT m_id AS xref FROM wt_media WHERE m_file = $${params.push(gedcomId)}` },
  { sql: `SELECT o_id AS xref FROM wt_other WHERE o_file = $${params.push(gedcomId)} AND o_type NOT IN ('HEAD', 'TRLR')` },
];

/**
 * Mirrors AdminService::countCommonXrefs() (app/Services/AdminService.php:58-103).
 *
 * @param {import('pg').Pool} pool
 * @param {number} tree1Id
 * @param {number} tree2Id
 * @returns {Promise<number>}
 */
export async function countCommonXrefs(pool, tree1Id, tree2Id) {
  const params = [];
  const sub1 = XREF_UNION_TABLES(tree1Id, params)
    .map((q) => q.sql)
    .join(' UNION ');
  const sub2 = XREF_UNION_TABLES(tree2Id, params)
    .map((q) => q.sql)
    .join(' UNION ');

  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM (${sub1}) AS sub1 JOIN (${sub2}) AS sub2 ON sub1.xref = sub2.xref`,
    params,
  );

  return parseInt(result.rows[0].count, 10);
}

const MERGE_TABLES = [
  {
    table: 'wt_individuals',
    fileColumn: 'i_file',
    columns: ['i_id', 'i_rin', 'i_sex', 'i_gedcom'],
  },
  {
    table: 'wt_families',
    fileColumn: 'f_file',
    columns: ['f_id', 'f_husb', 'f_wife', 'f_gedcom', 'f_numchil'],
  },
  {
    table: 'wt_sources',
    fileColumn: 's_file',
    columns: ['s_id', 's_name', 's_gedcom'],
  },
  {
    table: 'wt_media',
    fileColumn: 'm_file',
    columns: ['m_id', 'm_gedcom'],
  },
  {
    table: 'wt_media_file',
    fileColumn: 'm_file',
    columns: ['m_id', 'multimedia_file_refn', 'multimedia_format', 'source_media_type', 'descriptive_title'],
  },
  {
    table: 'wt_other',
    fileColumn: 'o_file',
    columns: ['o_id', 'o_type', 'o_gedcom'],
    extraWhere: "o_type NOT IN ('HEAD', 'TRLR')",
  },
  {
    table: 'wt_name',
    fileColumn: 'n_file',
    columns: [
      'n_id',
      'n_num',
      'n_type',
      'n_sort',
      'n_full',
      'n_surname',
      'n_surn',
      'n_givn',
      'n_soundex_givn_std',
      'n_soundex_surn_std',
      'n_soundex_givn_dm',
      'n_soundex_surn_dm',
    ],
  },
  {
    table: 'wt_dates',
    fileColumn: 'd_file',
    columns: ['d_gid', 'd_day', 'd_month', 'd_mon', 'd_year', 'd_julianday1', 'd_julianday2', 'd_fact', 'd_type'],
  },
  {
    table: 'wt_link',
    fileColumn: 'l_file',
    columns: ['l_from', 'l_type', 'l_to'],
    extraWhere: "l_from NOT IN ('HEAD', 'TRLR')",
  },
];

/**
 * Mirrors MergeTreesAction (app/Http/RequestHandlers/MergeTreesAction.php:47-241):
 * copies every record from tree1 into tree2 by re-pointing the
 * file-id column, table by table. Transactional. Caller is
 * responsible for the countCommonXrefs()===0 pre-check (mirrors the
 * real handler's own guard).
 *
 * @param {import('pg').Pool} pool
 * @param {number} tree1Id
 * @param {number} tree2Id
 * @returns {Promise<void>}
 */
export async function mergeTreesTransactional(pool, tree1Id, tree2Id) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // eslint-disable-next-line no-restricted-syntax
    for (const { table, fileColumn, columns, extraWhere } of MERGE_TABLES) {
      const where = extraWhere ? `${fileColumn} = $2 AND ${extraWhere}` : `${fileColumn} = $2`;
      const sql = `INSERT INTO ${table} (${fileColumn}, ${columns.join(', ')}) SELECT $1, ${columns.join(', ')} FROM ${table} WHERE ${where}`;
      // eslint-disable-next-line no-await-in-loop
      await client.query(sql, [tree2Id, tree1Id]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function hasPendingEdit(pool, gedcomId) {
  const result = await pool.query("SELECT 1 FROM wt_change WHERE gedcom_id = $1 AND status = 'pending' LIMIT 1", [gedcomId]);

  return result.rows.length > 0;
}

/**
 * Mirrors AdminService::duplicateXrefs() (app/Services/AdminService.php:189-230):
 * XREFs used by this tree that are ALSO used by some other tree.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Record<string,string>>} xref -> record type
 */
export async function duplicateXrefs(pool, gedcomId) {
  const result = await pool.query(
    `SELECT sub1.xref, sub1.type FROM (
       SELECT i_id AS xref, 'INDI' AS type FROM wt_individuals WHERE i_file = $1
       UNION SELECT f_id AS xref, 'FAM' AS type FROM wt_families WHERE f_file = $1
       UNION SELECT s_id AS xref, 'SOUR' AS type FROM wt_sources WHERE s_file = $1
       UNION SELECT m_id AS xref, 'OBJE' AS type FROM wt_media WHERE m_file = $1
       UNION SELECT o_id AS xref, o_type AS type FROM wt_other WHERE o_file = $1 AND o_type NOT IN ('HEAD', 'TRLR')
     ) AS sub1
     JOIN (
       SELECT xref FROM wt_change WHERE gedcom_id <> $1
       UNION SELECT i_id AS xref FROM wt_individuals WHERE i_file <> $1
       UNION SELECT f_id AS xref FROM wt_families WHERE f_file <> $1
       UNION SELECT s_id AS xref FROM wt_sources WHERE s_file <> $1
       UNION SELECT m_id AS xref FROM wt_media WHERE m_file <> $1
       UNION SELECT o_id AS xref FROM wt_other WHERE o_file <> $1 AND o_type NOT IN ('HEAD', 'TRLR')
     ) AS sub2 ON sub1.xref = sub2.xref`,
    [gedcomId],
  );

  const xrefs = {};

  for (const row of result.rows) {
    xrefs[row.xref] = row.type;
  }

  return xrefs;
}

function sqlReplace(column, from, to) {
  return `REPLACE(${column}, '${from.replaceAll("'", "''")}', '${to.replaceAll("'", "''")}')`;
}

/**
 * Mirrors XrefFactory::make()/generate() (app/Factories/XrefFactory.php:34-71)
 * exactly: new XREFs always use the 'X' prefix regardless of record
 * type (make() ignores its own $record_type argument in the real
 * PHP), a site-wide 'next_xref' counter is advanced with the same
 * exponential-increment scan, and uniqueness is checked across every
 * tree's individuals/families/sources/media/other/change rows (not
 * just the current tree) - this is what makes renumbering safe to
 * deduplicate a cross-tree XREF collision without creating a new one.
 *
 * @param {import('pg').PoolClient} client an open transaction client (for the row lock)
 * @returns {Promise<string>}
 */
async function generateXref(client) {
  const lockResult = await client.query(
    "SELECT setting_value FROM wt_site_setting WHERE setting_name = 'next_xref' FOR UPDATE",
  );
  let num = parseInt(lockResult.rows[0]?.setting_value ?? '0', 10) || 0;
  let increment = 1.0;
  let xref;
  let alreadyUsed;

  do {
    num += Math.trunc(increment);
    increment *= 1.01;
    xref = `X${num}`;

    // eslint-disable-next-line no-await-in-loop
    const usedResult = await client.query(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM wt_individuals WHERE i_id = $1)
          OR EXISTS (SELECT 1 FROM wt_families WHERE f_id = $1)
          OR EXISTS (SELECT 1 FROM wt_sources WHERE s_id = $1)
          OR EXISTS (SELECT 1 FROM wt_media WHERE m_id = $1)
          OR EXISTS (SELECT 1 FROM wt_other WHERE o_id = $1)
          OR EXISTS (SELECT 1 FROM wt_change WHERE xref = $1)`,
      [xref],
    );
    alreadyUsed = usedResult.rows.length > 0;
  } while (alreadyUsed);

  await client.query(
    `INSERT INTO wt_site_setting (setting_name, setting_value) VALUES ('next_xref', $1)
     ON CONFLICT (setting_name) DO UPDATE SET setting_value = $1`,
    [String(num)],
  );

  return xref;
}

/**
 * Mirrors RenumberTreeAction's huge per-type REPLACE-everywhere logic
 * (app/Http/RequestHandlers/RenumberTreeAction.php:54-564) exactly -
 * every table/column it touches, in the same order, for each
 * duplicate XREF. old_xref comes from the database (already a valid
 * XREF); new_xref is generated here - same "no SQL injection risk"
 * reasoning the PHP source documents at RenumberTreeAction.php:70-77,
 * carried over unchanged (the GEDCOM 7 caveat in that comment doesn't
 * apply - this migration doesn't support GEDCOM 7).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {Record<string,string>} xrefs xref -> record type, from duplicateXrefs()
 * @returns {Promise<void>}
 */
export async function renumberTreeTransactional(pool, gedcomId, xrefs) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // eslint-disable-next-line no-restricted-syntax
    for (const [oldXref, type] of Object.entries(xrefs)) {
      // eslint-disable-next-line no-await-in-loop
      const newXref = await generateXref(client);

      // eslint-disable-next-line no-await-in-loop
      await renumberOneRecord(client, gedcomId, oldXref, newXref, type);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function renumberOneRecord(client, gedcomId, oldXref, newXref, type) {
  switch (type) {
    case RECORD_TYPE_INDIVIDUAL:
      await client.query(
        `UPDATE wt_individuals SET i_id = $1, i_gedcom = ${sqlReplace('i_gedcom', `0 @${oldXref}@ INDI`, `0 @${newXref}@ INDI`)} WHERE i_file = $2 AND i_id = $3`,
        [newXref, gedcomId, oldXref],
      );
      await client.query(
        `UPDATE wt_families SET f_husb = $1, f_gedcom = ${sqlReplace('f_gedcom', ` HUSB @${oldXref}@`, ` HUSB @${newXref}@`)} WHERE f_husb = $2 AND f_file = $3`,
        [newXref, oldXref, gedcomId],
      );
      await client.query(
        `UPDATE wt_families SET f_wife = $1, f_gedcom = ${sqlReplace('f_gedcom', ` WIFE @${oldXref}@`, ` WIFE @${newXref}@`)} WHERE f_wife = $2 AND f_file = $3`,
        [newXref, oldXref, gedcomId],
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const tag of ['CHIL', 'ASSO', '_ASSO']) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE wt_families SET f_gedcom = ${sqlReplace('f_gedcom', ` ${tag} @${oldXref}@`, ` ${tag} @${newXref}@`)}
           WHERE f_file = $1 AND f_id IN (
             SELECT l_from FROM wt_link WHERE l_file = $1 AND l_to = $2 AND l_type = $3
           )`,
          [gedcomId, oldXref, tag],
        );
      }

      // eslint-disable-next-line no-restricted-syntax
      for (const tag of ['ALIA', 'ASSO', '_ASSO']) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE wt_individuals SET i_gedcom = ${sqlReplace('i_gedcom', ` ${tag} @${oldXref}@`, ` ${tag} @${newXref}@`)}
           WHERE i_file = $1 AND i_id IN (
             SELECT l_from FROM wt_link WHERE l_file = $1 AND l_to = $2 AND l_type = $3
           )`,
          [gedcomId, oldXref, tag],
        );
      }

      await client.query('UPDATE wt_placelinks SET pl_gid = $1 WHERE pl_file = $2 AND pl_gid = $3', [newXref, gedcomId, oldXref]);
      await client.query('UPDATE wt_dates SET d_gid = $1 WHERE d_file = $2 AND d_gid = $3', [newXref, gedcomId, oldXref]);
      await client.query(
        "UPDATE wt_user_gedcom_setting SET setting_value = $1 WHERE gedcom_id = $2 AND setting_value = $3 AND setting_name IN ('gedcomid', 'rootid')",
        [newXref, gedcomId, oldXref],
      );
      break;

    case RECORD_TYPE_FAMILY:
      await client.query(
        `UPDATE wt_families SET f_id = $1, f_gedcom = ${sqlReplace('f_gedcom', `0 @${oldXref}@ FAM`, `0 @${newXref}@ FAM`)} WHERE f_file = $2 AND f_id = $3`,
        [newXref, gedcomId, oldXref],
      );

      // eslint-disable-next-line no-restricted-syntax
      for (const tag of ['FAMC', 'FAMS']) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE wt_individuals SET i_gedcom = ${sqlReplace('i_gedcom', ` ${tag} @${oldXref}@`, ` ${tag} @${newXref}@`)}
           WHERE i_file = $1 AND i_id IN (
             SELECT l_from FROM wt_link WHERE l_file = $1 AND l_to = $2 AND l_type = $3
           )`,
          [gedcomId, oldXref, tag],
        );
      }

      await client.query('UPDATE wt_placelinks SET pl_gid = $1 WHERE pl_file = $2 AND pl_gid = $3', [newXref, gedcomId, oldXref]);
      await client.query('UPDATE wt_dates SET d_gid = $1 WHERE d_file = $2 AND d_gid = $3', [newXref, gedcomId, oldXref]);
      break;

    case RECORD_TYPE_SOURCE:
      await client.query(
        `UPDATE wt_sources SET s_id = $1, s_gedcom = ${sqlReplace('s_gedcom', `0 @${oldXref}@ SOUR`, `0 @${newXref}@ SOUR`)} WHERE s_file = $2 AND s_id = $3`,
        [newXref, gedcomId, oldXref],
      );
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'SOUR', 'wt_individuals', 'i_file', 'i_id', 'i_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'SOUR', 'wt_families', 'f_file', 'f_id', 'f_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'SOUR', 'wt_media', 'm_file', 'm_id', 'm_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'SOUR', 'wt_other', 'o_file', 'o_id', 'o_gedcom');
      break;

    case RECORD_TYPE_REPOSITORY:
      await client.query(
        `UPDATE wt_other SET o_id = $1, o_gedcom = ${sqlReplace('o_gedcom', `0 @${oldXref}@ REPO`, `0 @${newXref}@ REPO`)} WHERE o_file = $2 AND o_id = $3 AND o_type = 'REPO'`,
        [newXref, gedcomId, oldXref],
      );
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'REPO', 'wt_sources', 's_file', 's_id', 's_gedcom');
      break;

    case RECORD_TYPE_NOTE:
      await client.query(
        `UPDATE wt_other SET o_id = $1, o_gedcom = ${sqlReplace('o_gedcom', `0 @${oldXref}@ NOTE`, `0 @${newXref}@ NOTE`)} WHERE o_file = $2 AND o_id = $3 AND o_type = 'NOTE'`,
        [newXref, gedcomId, oldXref],
      );
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'NOTE', 'wt_individuals', 'i_file', 'i_id', 'i_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'NOTE', 'wt_families', 'f_file', 'f_id', 'f_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'NOTE', 'wt_media', 'm_file', 'm_id', 'm_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'NOTE', 'wt_sources', 's_file', 's_id', 's_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'NOTE', 'wt_other', 'o_file', 'o_id', 'o_gedcom');
      break;

    case RECORD_TYPE_MEDIA:
      await client.query(
        `UPDATE wt_media SET m_id = $1, m_gedcom = ${sqlReplace('m_gedcom', `0 @${oldXref}@ OBJE`, `0 @${newXref}@ OBJE`)} WHERE m_file = $2 AND m_id = $3`,
        [newXref, gedcomId, oldXref],
      );
      await client.query('UPDATE wt_media_file SET m_id = $1 WHERE m_file = $2 AND m_id = $3', [newXref, gedcomId, oldXref]);
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'OBJE', 'wt_individuals', 'i_file', 'i_id', 'i_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'OBJE', 'wt_families', 'f_file', 'f_id', 'f_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'OBJE', 'wt_sources', 's_file', 's_id', 's_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, 'OBJE', 'wt_other', 'o_file', 'o_id', 'o_gedcom');
      break;

    default:
      await client.query(
        `UPDATE wt_other SET o_id = $1, o_gedcom = ${sqlReplace('o_gedcom', `0 @${oldXref}@ ${type}`, `0 @${newXref}@ ${type}`)} WHERE o_file = $2 AND o_id = $3 AND o_type = $4`,
        [newXref, gedcomId, oldXref, type],
      );
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, type, 'wt_individuals', 'i_file', 'i_id', 'i_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, type, 'wt_families', 'f_file', 'f_id', 'f_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, type, 'wt_media', 'm_file', 'm_id', 'm_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, type, 'wt_sources', 's_file', 's_id', 's_gedcom');
      await updateLinkedGedcom(client, gedcomId, oldXref, newXref, type, 'wt_other', 'o_file', 'o_id', 'o_gedcom');
      break;
  }

  await client.query('UPDATE wt_name SET n_id = $1 WHERE n_file = $2 AND n_id = $3', [newXref, gedcomId, oldXref]);
  await client.query('UPDATE wt_default_resn SET xref = $1 WHERE gedcom_id = $2 AND xref = $3', [newXref, gedcomId, oldXref]);
  await client.query('UPDATE wt_hit_counter SET page_parameter = $1 WHERE gedcom_id = $2 AND page_parameter = $3', [
    newXref,
    gedcomId,
    oldXref,
  ]);
  await client.query('UPDATE wt_link SET l_from = $1 WHERE l_file = $2 AND l_from = $3', [newXref, gedcomId, oldXref]);
  await client.query('UPDATE wt_link SET l_to = $1 WHERE l_file = $2 AND l_to = $3', [newXref, gedcomId, oldXref]);
  await client.query('UPDATE wt_favorite SET xref = $1 WHERE gedcom_id = $2 AND xref = $3', [newXref, gedcomId, oldXref]);
}

async function updateLinkedGedcom(client, gedcomId, oldXref, newXref, tag, table, fileColumn, idColumn, gedcomColumn) {
  await client.query(
    `UPDATE ${table} SET ${gedcomColumn} = ${sqlReplace(gedcomColumn, ` ${tag} @${oldXref}@`, ` ${tag} @${newXref}@`)}
     WHERE ${fileColumn} = $1 AND ${idColumn} IN (
       SELECT l_from FROM wt_link WHERE l_file = $1 AND l_to = $2 AND l_type = $3
     )`,
    [gedcomId, oldXref, tag],
  );
}

const PREFERENCE_FIELDS = [
  'CALENDAR_FORMAT',
  'CHART_BOX_TAGS',
  'EXPAND_NOTES',
  'EXPAND_SOURCES',
  'FAM_FACTS_QUICK',
  'FORMAT_TEXT',
  'GENERATE_UIDS',
  'HIDE_GEDCOM_ERRORS',
  'INDI_FACTS_QUICK',
  'MEDIA_UPLOAD',
  'META_DESCRIPTION',
  'META_TITLE',
  'NO_UPDATE_CHAN',
  'PEDIGREE_ROOT_ID',
  'QUICK_REQUIRED_FACTS',
  'QUICK_REQUIRED_FAMFACTS',
  'SHOW_COUNTER',
  'SHOW_EST_LIST_DATES',
  'SHOW_FACT_ICONS',
  'SHOW_GEDCOM_RECORD',
  'SHOW_HIGHLIGHT_IMAGES',
  'SHOW_LAST_CHANGE',
  'SHOW_MEDIA_DOWNLOAD',
  'SHOW_NO_WATERMARK',
  'SHOW_PARENTS_AGE',
  'SHOW_PEDIGREE_PLACES',
  'SHOW_PEDIGREE_PLACES_SUFFIX',
  'SHOW_RELATIVES_EVENTS',
  'SUBLIST_TRIGGER_I',
  'SURNAME_LIST_STYLE',
  'SURNAME_TRADITION',
  'USE_SILHOUETTE',
  'MEDIA_DIRECTORY',
];

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{row: object, preferences: Record<string,string>}>}
 */
export async function loadTreeForPreferences(pool, gedcomId) {
  const treeResult = await pool.query('SELECT * FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);
  const row = treeResult.rows[0] ?? null;

  if (row === null) {
    return null;
  }

  const settingsResult = await pool.query('SELECT setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1', [gedcomId]);
  const preferences = {};

  for (const settingRow of settingsResult.rows) {
    preferences[settingRow.setting_name] = settingRow.setting_value;
  }

  return { row, preferences };
}

/**
 * Mirrors TreePreferencesAction (app/Http/RequestHandlers/TreePreferencesAction.php:42-175).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, isAdmin: boolean, treeName: string, formData: URLSearchParams}} params
 * @returns {Promise<{gedcomName: string, duplicateName: boolean}>}
 */
export async function updateTreePreferences(pool, { gedcomId, isAdmin, treeName, formData }) {
  const calendarFormat0 = formData.get('CALENDAR_FORMAT0') ?? '';
  const calendarFormat1 = formData.get('CALENDAR_FORMAT1') ?? '';
  const calendarFormat = [...new Set([calendarFormat0, calendarFormat1])].join('_and_');

  const listFields = {
    CHART_BOX_TAGS: formData.getAll('CHART_BOX_TAGS[]'),
    FAM_FACTS_QUICK: formData.getAll('FAM_FACTS_QUICK[]'),
    INDI_FACTS_QUICK: formData.getAll('INDI_FACTS_QUICK[]'),
    QUICK_REQUIRED_FACTS: formData.getAll('QUICK_REQUIRED_FACTS[]'),
    QUICK_REQUIRED_FAMFACTS: formData.getAll('QUICK_REQUIRED_FAMFACTS[]'),
    SHOW_RELATIVES_EVENTS: formData.getAll('SHOW_RELATIVES_EVENTS[]'),
  };

  const booleanFields = [
    'EXPAND_NOTES',
    'EXPAND_SOURCES',
    'GENERATE_UIDS',
    'HIDE_GEDCOM_ERRORS',
    'NO_UPDATE_CHAN',
    'SHOW_COUNTER',
    'SHOW_EST_LIST_DATES',
    'SHOW_FACT_ICONS',
    'SHOW_GEDCOM_RECORD',
    'SHOW_HIGHLIGHT_IMAGES',
    'SHOW_LAST_CHANGE',
    'SHOW_PARENTS_AGE',
    'USE_SILHOUETTE',
  ];

  const preferences = {
    CALENDAR_FORMAT: calendarFormat,
    CHART_BOX_TAGS: listFields.CHART_BOX_TAGS.join(','),
    FAM_FACTS_QUICK: listFields.FAM_FACTS_QUICK.join(','),
    FORMAT_TEXT: formData.get('FORMAT_TEXT') ?? '',
    INDI_FACTS_QUICK: listFields.INDI_FACTS_QUICK.join(','),
    MEDIA_UPLOAD: formData.get('MEDIA_UPLOAD') ?? '',
    META_DESCRIPTION: formData.get('META_DESCRIPTION') ?? '',
    META_TITLE: formData.get('META_TITLE') ?? '',
    PEDIGREE_ROOT_ID: formData.get('PEDIGREE_ROOT_ID') ?? '',
    QUICK_REQUIRED_FACTS: listFields.QUICK_REQUIRED_FACTS.join(','),
    QUICK_REQUIRED_FAMFACTS: listFields.QUICK_REQUIRED_FAMFACTS.join(','),
    SHOW_MEDIA_DOWNLOAD: formData.get('SHOW_MEDIA_DOWNLOAD') ?? '0',
    SHOW_NO_WATERMARK: formData.get('SHOW_NO_WATERMARK') ?? '0',
    SHOW_PEDIGREE_PLACES: formData.get('SHOW_PEDIGREE_PLACES') ?? '0',
    SHOW_PEDIGREE_PLACES_SUFFIX: formData.get('SHOW_PEDIGREE_PLACES_SUFFIX') ?? '0',
    SHOW_RELATIVES_EVENTS: listFields.SHOW_RELATIVES_EVENTS.join(','),
    SUBLIST_TRIGGER_I: formData.get('SUBLIST_TRIGGER_I') ?? '0',
    SURNAME_LIST_STYLE: formData.get('SURNAME_LIST_STYLE') ?? '',
    SURNAME_TRADITION: formData.get('SURNAME_TRADITION') ?? '',
  };

  for (const field of booleanFields) {
    preferences[field] = formData.get(field) === '1' || formData.get(field) === 'on' || formData.get(field) === 'true' ? '1' : '';
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // eslint-disable-next-line no-restricted-syntax
    for (const [name, value] of Object.entries(preferences)) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO wt_gedcom_setting (gedcom_id, setting_name, setting_value) VALUES ($1, $2, $3)
         ON CONFLICT (gedcom_id, setting_name) DO UPDATE SET setting_value = $3`,
        [gedcomId, name, value],
      );
    }

    let gedcomName = treeName;
    let duplicateName = false;

    const title = formData.get('title') ?? '';
    let mediaDirectory;

    if (isAdmin) {
      let requestedGedcom = (formData.get('gedcom') ?? '').replaceAll(/[:/\\]+/g, '/');
      requestedGedcom = requestedGedcom.replace(/^\/+|\/+$/g, '');

      mediaDirectory = `${(formData.get('MEDIA_DIRECTORY') ?? '').replaceAll(/[:/\\]+/g, '/').replace(/^\/+|\/+$/g, '')}/`;

      const duplicateResult = await client.query('SELECT 1 FROM wt_gedcom WHERE gedcom_name = $1 AND gedcom_id <> $2', [
        requestedGedcom,
        gedcomId,
      ]);

      if (duplicateResult.rows.length > 0) {
        duplicateName = true;
        gedcomName = treeName;
      } else {
        gedcomName = requestedGedcom;
      }
    } else {
      const mediaFolderResult = await client.query('SELECT media_folder FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);
      mediaDirectory = mediaFolderResult.rows[0]?.media_folder ?? 'media/';
      gedcomName = treeName;
    }

    const contactUserId = parseInt(formData.get('CONTACT_USER_ID') ?? '0', 10) || null;
    const webmasterUserId = parseInt(formData.get('WEBMASTER_USER_ID') ?? '0', 10) || null;

    await client.query(
      'UPDATE wt_gedcom SET contact_user_id = $1, media_folder = $2, gedcom_name = $3, support_user_id = $4, title = $5 WHERE gedcom_id = $6',
      [contactUserId, mediaDirectory, gedcomName, webmasterUserId, title, gedcomId],
    );

    if (treeName !== gedcomName) {
      await client.query("UPDATE wt_site_setting SET setting_value = $1 WHERE setting_name = 'DEFAULT_GEDCOM' AND setting_value = $2", [
        gedcomName,
        treeName,
      ]);
    }

    await client.query('COMMIT');

    return { gedcomName, duplicateName };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{tree: object, preferences: Record<string,string>, restrictions: Array}>}
 */
export async function loadPrivacyData(pool, gedcomId) {
  const treeResult = await pool.query('SELECT * FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);
  const tree = treeResult.rows[0] ?? null;

  if (tree === null) {
    return null;
  }

  const settingsResult = await pool.query('SELECT setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1', [gedcomId]);
  const preferences = {};

  for (const row of settingsResult.rows) {
    preferences[row.setting_name] = row.setting_value;
  }

  const restrictionsResult = await pool.query(
    'SELECT default_resn_id, xref, tag_type, resn FROM wt_default_resn WHERE gedcom_id = $1 ORDER BY default_resn_id',
    [gedcomId],
  );

  return { tree, preferences, restrictions: restrictionsResult.rows };
}

/**
 * Mirrors TreePrivacyAction (app/Http/RequestHandlers/TreePrivacyAction.php:37-137).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, formData: URLSearchParams}} params
 * @returns {Promise<void>}
 */
export async function updatePrivacy(pool, { gedcomId, formData }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const deleteIds = formData.getAll('delete[]').filter((id) => id !== '');

    if (deleteIds.length > 0) {
      await client.query('DELETE FROM wt_default_resn WHERE default_resn_id = ANY($1::int[])', [deleteIds.map((id) => parseInt(id, 10))]);
    }

    const xrefs = formData.getAll('xref[]');
    const tagTypes = formData.getAll('tag_type[]');
    const resns = formData.getAll('resn[]');

    for (let n = 0; n < xrefs.length; n++) {
      const xref = xrefs[n];
      const tagType = tagTypes[n] ?? '';
      const resn = resns[n];

      if (tagType !== '' && xref !== '') {
        // eslint-disable-next-line no-await-in-loop
        await client.query('DELETE FROM wt_default_resn WHERE gedcom_id = $1 AND tag_type = $2 AND xref = $3', [gedcomId, tagType, xref]);
      }
      if (tagType !== '' && xref === '') {
        // eslint-disable-next-line no-await-in-loop
        await client.query('DELETE FROM wt_default_resn WHERE gedcom_id = $1 AND tag_type = $2 AND xref IS NULL', [gedcomId, tagType]);
      }
      if (tagType === '' && xref !== '') {
        // eslint-disable-next-line no-await-in-loop
        await client.query('DELETE FROM wt_default_resn WHERE gedcom_id = $1 AND tag_type IS NULL AND xref = $2', [gedcomId, xref]);
      }

      if (tagType !== '' || xref !== '') {
        // eslint-disable-next-line no-await-in-loop
        await client.query('INSERT INTO wt_default_resn (gedcom_id, xref, tag_type, resn) VALUES ($1, $2, $3, $4)', [
          gedcomId,
          xref === '' ? null : xref,
          tagType === '' ? null : tagType,
          resn,
        ]);
      }
    }

    const hideLivePeople = formData.get('HIDE_LIVE_PEOPLE') ?? '';
    const keepAliveYearsBirth = parseInt(formData.get('KEEP_ALIVE_YEARS_BIRTH') ?? '0', 10) || 0;
    const keepAliveYearsDeath = parseInt(formData.get('KEEP_ALIVE_YEARS_DEATH') ?? '0', 10) || 0;
    const maxAliveAge = formData.get('MAX_ALIVE_AGE') ?? '';
    const requireAuthentication = formData.get('REQUIRE_AUTHENTICATION') ?? '0';
    const showDeadPeople = formData.get('SHOW_DEAD_PEOPLE') ?? '';
    const showLivingNames = formData.get('SHOW_LIVING_NAMES') ?? '';
    const showPrivateRelationships = formData.get('SHOW_PRIVATE_RELATIONSHIPS') ?? '';

    await client.query('UPDATE wt_gedcom SET private = $1 WHERE gedcom_id = $2', [parseInt(requireAuthentication, 10) || 0, gedcomId]);

    const preferences = {
      HIDE_LIVE_PEOPLE: hideLivePeople,
      KEEP_ALIVE_YEARS_BIRTH: String(keepAliveYearsBirth),
      KEEP_ALIVE_YEARS_DEATH: String(keepAliveYearsDeath),
      MAX_ALIVE_AGE: maxAliveAge,
      SHOW_DEAD_PEOPLE: showDeadPeople,
      SHOW_LIVING_NAMES: showLivingNames,
      SHOW_PRIVATE_RELATIONSHIPS: showPrivateRelationships,
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const [name, value] of Object.entries(preferences)) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO wt_gedcom_setting (gedcom_id, setting_name, setting_value) VALUES ($1, $2, $3)
         ON CONFLICT (gedcom_id, setting_name) DO UPDATE SET setting_value = $3`,
        [gedcomId, name, value],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reduced-scope port of CheckTree (app/Http/RequestHandlers/CheckTree.php).
 * The real handler validates EVERY GEDCOM tag against the full
 * element/tag registry (canonical-value checks, custom-tag warnings,
 * MIME-type checks for multimedia formats, GEDCOM-level-number
 * validation) - that registry is hundreds of PHP classes and was
 * never ported to this migration (it's a prerequisite for the whole
 * "GEDCOM import/export" bucket, not something to half-build here).
 *
 * What IS ported, because it is both the most common and the most
 * useful class of error, and needs none of that registry: dangling
 * XREF references (`%s does not exist`) and the family-record
 * HUSB/WIFE/CHIL and individual FAMC/FAMS back-link checks (`%1$s
 * does not have a link back to %2$s`), scanned directly off the raw
 * i_gedcom/f_gedcom/etc. text exactly as the PHP handler does.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{errors: string[], warnings: string[]}>}
 */
export async function checkTreeErrors(pool, gedcomId) {
  const result = await pool.query(
    `SELECT i_id AS xref, i_gedcom AS gedcom, 'INDI' AS type FROM wt_individuals WHERE i_file = $1
     UNION ALL
     SELECT f_id AS xref, f_gedcom AS gedcom, 'FAM' AS type FROM wt_families WHERE f_file = $1
     UNION ALL
     SELECT m_id AS xref, m_gedcom AS gedcom, 'OBJE' AS type FROM wt_media WHERE m_file = $1
     UNION ALL
     SELECT s_id AS xref, s_gedcom AS gedcom, 'SOUR' AS type FROM wt_sources WHERE s_file = $1
     UNION ALL
     SELECT o_id AS xref, o_gedcom AS gedcom, o_type AS type FROM wt_other WHERE o_file = $1`,
    [gedcomId],
  );

  const records = new Map();

  for (const row of result.rows) {
    records.set(row.xref, row);
  }

  const errors = [];
  const warnings = [];
  const linkPattern = /^\d+ ([A-Z_]+) @([A-Za-z0-9_.-]+)@/;

  for (const record of records.values()) {
    const lines = record.gedcom.split('\n');

    for (const line of lines) {
      const linkMatch = linkPattern.exec(line);

      if (linkMatch === null) {
        continue;
      }

      const tag = linkMatch[1];
      const targetXref = linkMatch[2];

      if (!['HUSB', 'WIFE', 'CHIL', 'FAMC', 'FAMS', 'SOUR', 'OBJE', 'NOTE', 'REPO', 'ASSO', '_ASSO', 'ALIA'].includes(tag)) {
        continue;
      }

      const target = records.get(targetXref);

      if (target === undefined) {
        errors.push(`${record.type}:${record.xref} - ${targetXref} does not exist.`);
        continue;
      }

      if ((tag === 'HUSB' || tag === 'WIFE') && !target.gedcom.includes(`\n1 FAMS @${record.xref}@`)) {
        errors.push(`${target.type}:${target.xref} does not have a link back to ${record.type}:${record.xref}.`);
      }

      if (tag === 'CHIL' && !target.gedcom.includes(`\n1 FAMC @${record.xref}@`)) {
        errors.push(`${target.type}:${target.xref} does not have a link back to ${record.type}:${record.xref}.`);
      }

      if (tag === 'FAMC' && !target.gedcom.includes(`\n1 CHIL @${record.xref}@`)) {
        errors.push(`${target.type}:${target.xref} does not have a link back to ${record.type}:${record.xref}.`);
      }

      if (
        tag === 'FAMS' &&
        !target.gedcom.includes(`\n1 HUSB @${record.xref}@`) &&
        !target.gedcom.includes(`\n1 WIFE @${record.xref}@`)
      ) {
        errors.push(`${target.type}:${target.xref} does not have a link back to ${record.type}:${record.xref}.`);
      }
    }

    if (record.type === RECORD_TYPE_FAMILY) {
      const husbCount = (record.gedcom.match(/\n1 HUSB @/g) ?? []).length;
      const wifeCount = (record.gedcom.match(/\n1 WIFE @/g) ?? []).length;

      if (husbCount > 1) {
        errors.push(`${record.type}:${record.xref} - FAM:HUSB occurs too many times.`);
      }
      if (wifeCount > 1) {
        errors.push(`${record.type}:${record.xref} - FAM:WIFE occurs too many times.`);
      }
    }
  }

  return { errors, warnings };
}
