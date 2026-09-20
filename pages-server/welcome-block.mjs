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

// Supports the ONE tree-page block this migration step ports -
// WelcomeBlockModule (module_name 'gedcom_block', confirmed live
// against the real "ophir" tree's wt_block rows). See
// docs/php-to-js-migration/phase5-tree-page.md for the full scope
// decision (7 of 8 default tree-page blocks are out of scope).

/**
 * Mirrors Tree::significantIndividual($user) (app/Tree.php:569-608)
 * for the no-explicit-xref call shape WelcomeBlockModule actually uses
 * (app/Module/WelcomeBlockModule.php:60) - the Family-fallback branch
 * (only reachable with an explicit xref argument) is not ported, since
 * nothing in this step's scope ever supplies one.
 *
 * Each step below is an EXISTS-style check against wt_individuals,
 * matching IndividualFactory::make()'s own existence semantics
 * (app/Factories/IndividualFactory.php) - NOT full GEDCOM parsing.
 * Pending (unsaved editor) changes are not consulted, matching this
 * migration's established "editor features are out of scope" cuts
 * elsewhere.
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number}} tree
 * @param {{userId: number|null}} user
 * @returns {Promise<string|null>} xref, or null if the tree has zero individuals
 */
export async function significantIndividualXref(pool, tree, user) {
  // Steps 1-2: PREF_TREE_DEFAULT_XREF ('rootid'), PREF_TREE_ACCOUNT_XREF
  // ('gedcomid') - confirmed against app/Contracts/UserInterface.php's
  // actual constant values, not guessed from the names. Anonymous
  // visitors skip straight past these (PHP's GuestUser::id() is 0,
  // which never matches a real wt_user_gedcom_setting row either).
  if (user.userId !== null) {
    const prefsResult = await pool.query(
      `SELECT setting_name, setting_value FROM wt_user_gedcom_setting
       WHERE gedcom_id = $1 AND user_id = $2 AND setting_name IN ('rootid', 'gedcomid')`,
      [tree.gedcomId, user.userId],
    );
    const byName = Object.fromEntries(prefsResult.rows.map((row) => [row.setting_name, row.setting_value]));

    for (const settingName of ['rootid', 'gedcomid']) {
      const xref = byName[settingName];

      if (xref && (await individualExists(pool, tree.gedcomId, xref))) {
        return xref;
      }
    }
  }

  // Step 3: the tree's own PEDIGREE_ROOT_ID (wt_gedcom_setting).
  const rootResult = await pool.query(
    "SELECT setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name = 'PEDIGREE_ROOT_ID'",
    [tree.gedcomId],
  );
  const rootId = rootResult.rows[0]?.setting_value;

  if (rootId && (await individualExists(pool, tree.gedcomId, rootId))) {
    return rootId;
  }

  // Step 4: the individual with the lowest xref in the tree.
  const minResult = await pool.query('SELECT MIN(i_id) AS xref FROM wt_individuals WHERE i_file = $1', [
    tree.gedcomId,
  ]);

  // null here means the tree genuinely has zero individuals - PHP's
  // own absolute fallback (a synthetic, never-persisted individual,
  // app/Tree.php:607) is not replicated; callers should treat null as
  // "omit the block" rather than link to a record that was never
  // saved.
  return minResult.rows[0]?.xref ?? null;
}

async function individualExists(pool, gedcomId, xref) {
  const result = await pool.query('SELECT 1 FROM wt_individuals WHERE i_id = $1 AND i_file = $2', [xref, gedcomId]);

  return result.rows.length > 0;
}

/**
 * Mirrors HomePageService::treeBlocks()'s query
 * (app/Services/HomePageService.php:148-156) scoped to just
 * 'gedcom_block': whether this SPECIFIC TREE has actually configured
 * the welcome block on its page at all (a real wt_block row - a tree
 * admin can remove it, this is not the same question as "is the
 * module enabled site-wide"), filtered through
 * ModuleService::findByComponent(ModuleBlockInterface::class, ...)'s
 * own enabled+privacy check (app/Services/ModuleService.php).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, viewerAccessLevel: 0|1|2}} params
 * @returns {Promise<number|null>} the real wt_block.block_id, or null if
 *   this tree has no configured gedcom_block row, the module is
 *   disabled, or it's not visible at the viewer's access level
 */
export async function findVisibleWelcomeBlockId(pool, { gedcomId, viewerAccessLevel }) {
  const blockResult = await pool.query(
    "SELECT block_id FROM wt_block WHERE gedcom_id = $1 AND module_name = 'gedcom_block'",
    [gedcomId],
  );
  const blockId = blockResult.rows[0]?.block_id;

  if (blockId === undefined) {
    return null;
  }

  const moduleResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'gedcom_block'");

  // No row at all ⇒ enabled by default (AbstractModule::isEnabledByDefault()).
  if (moduleResult.rows[0]?.status === 'disabled') {
    return null;
  }

  const privacyResult = await pool.query(
    `SELECT access_level FROM wt_module_privacy
     WHERE module_name = 'gedcom_block' AND gedcom_id = $1
       AND interface = 'Fisharebest\\Webtrees\\Module\\ModuleBlockInterface'`,
    [gedcomId],
  );

  // No override row ⇒ the module's hardcoded default, Auth::PRIV_PRIVATE
  // (2) - visible to everyone unless a tree admin explicitly restricted it.
  const accessLevel = privacyResult.rows[0]?.access_level ?? 2;

  return accessLevel >= viewerAccessLevel ? blockId : null;
}
