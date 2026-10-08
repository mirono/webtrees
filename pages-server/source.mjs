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

// Data/logic layer for /tree/{tree}/source/{xref} (SourcePage) - the
// third real-GEDCOM-record route, and the first that ISN'T Individual
// or Family. Source's real privacy chain (app/Source.php) turns out to
// be the simplest yet: no relationship-BFS, no keep-alive, no
// dead-people logic - just the shared RESN chain
// (canShowViaResnChain(), already built) plus ONE extra check: a
// source attached to a private repository is hidden too. Repositories
// themselves use PHP's base GedcomRecord::canShowByType() unmodified -
// same shared chain, no repository-specific override at all. See
// docs/php-to-js-migration/phase5-source-page.md for the full scope:
// title heading (from TITL) + every real fact
// (TITL/AUTH/PUBL/ABBR/TEXT/REPO/CHAN, matching real PHP's own
// record-page-details.phtml, which has no tag allowlist at all) - no
// linked-individuals/families/media reverse-lookup section (a separate,
// real PHP feature - deferred, same "narrow slice" cut as every prior
// step), no slug canonicalization.
//
// This file also owns Repository's own data/logic (loadRepository()/
// repositoryCanShowRecord() were needed for Source's own privacy
// cascade above already; displayableRepositoryFacts()/
// repositoryFactOtherAttributes() extend that to RepositoryPage's own
// route - see docs/php-to-js-migration/phase5-repository-page.md).

import { canShowViaResnChain, otherFactAttributes, factPlainValue, parseFacts } from './individual.mjs';

// Base GedcomRecord::canShowByType() (app/GedcomRecord.php:841-852)'s
// own record-type-level default: PUBLIC unless a tree-wide
// wt_default_resn row exists for this record type (tag_type = 'SOUR'
// or 'REPO', xref IS NULL) - notably DIFFERENT from Individual's own
// canShowByType() default (member-only) - confirmed by reading the
// base method directly, not assumed from Individual's more elaborate
// override.
function defaultRecordCanShow(treeFactResn, recordType, viewer) {
  const resn = treeFactResn.get(recordType) ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

function factTag(factGedcom) {
  const match = /^1 (\S+)/.exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadSource(pool, gedcomId, xref) {
  const result = await pool.query('SELECT s_id, s_gedcom FROM wt_sources WHERE s_id = $1 AND s_file = $2', [xref, gedcomId]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].s_id, gedcom: result.rows[0].s_gedcom };
}

/**
 * Repositories have no dedicated table (unlike individuals/families/
 * sources) - confirmed live they're stored in the generic wt_other
 * table, discriminated by `o_type = 'REPO'` (alongside NOTE/SUBM/SUBN/
 * HEAD/TRLR rows).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadRepository(pool, gedcomId, xref) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2 AND o_type = 'REPO'", [
    xref,
    gedcomId,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].o_id, gedcom: result.rows[0].o_gedcom };
}

/**
 * Every repository in the tree (RepositoryListModule::handle(),
 * app/Module/RepositoryListModule.php:97-104 - `DB::table('other')
 * ->where('o_type', '=', Repository::RECORD_TYPE)->get()`), ordered by
 * xref - real PHP applies no explicit ORDER BY either (the DataTables
 * JS this migration doesn't reproduce sorts client-side), so ordering
 * by xref is this migration's own deterministic substitute, not a
 * faithful copy of an unspecified SQL row order.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{xref: string, gedcom: string}[]>}
 */
export async function loadRepositoryList(pool, gedcomId) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_file = $1 AND o_type = 'REPO' ORDER BY o_id", [gedcomId]);

  return result.rows.map((row) => ({ xref: row.o_id, gedcom: row.o_gedcom }));
}

/**
 * Mirrors resources/views/lists/repositories-table.phtml's own
 * `$count_sources` query - a single grouped count of every SOUR-citing
 * `wt_link` row per repository, deliberately NOT privacy-filtered
 * (the real template's own comment: "It is not good to bypass privacy,
 * but many servers do not have the resources to process privacy for
 * every record in the tree" - reproduced as-is, not improved on).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function repositorySourceCounts(pool, gedcomId) {
  const result = await pool.query("SELECT l_to, COUNT(*) AS total FROM wt_link WHERE l_type = 'REPO' AND l_file = $1 GROUP BY l_to", [
    gedcomId,
  ]);

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors GedcomRecord::lastChangeTimestamp()'s own CHAN extraction -
 * the record's own `1 CHAN` fact's DATE/TIME, or null if it has none
 * (real PHP falls back to a zero Unix timestamp, rendered as "Never" -
 * see repository-list-view.mjs's own renderLastChange()).
 *
 * @param {string} gedcom
 * @returns {{date: string, time: string}|null}
 */
export function recordLastChange(gedcom) {
  const dateMatch = /\n1 CHAN\n2 DATE (.+)/.exec(gedcom);

  if (dateMatch === null) {
    return null;
  }

  const timeMatch = /\n1 CHAN\n2 DATE .+\n3 TIME (.+)/.exec(gedcom);

  return { date: dateMatch[1], time: timeMatch ? timeMatch[1] : '' };
}

/**
 * Mirrors Source::canShowByType()'s own REPO scan
 * (app/Source.php:36-49): every `1 REPO @Rn@` xref referenced.
 *
 * @param {string[]} facts
 * @returns {string[]}
 */
export function repoXrefs(facts) {
  const xrefs = [];

  for (const fact of facts) {
    const match = /^1 REPO @([^@]+)@/.exec(fact);

    if (match) {
      xrefs.push(match[1]);
    }
  }

  return xrefs;
}

// Tags this route's facts table renders. Real PHP's record-page-details.phtml
// (used for Source, same as Note/Media/Repository/Submitter) has NO
// allowlist at all - it renders EVERY fact on the record via
// `$record->facts([], true)` (app/GedcomRecord.php:552-570, empty
// $filter = no tag filtering, privacy-filtered only) - unlike
// Individual/Family, which route several tags to separate tab modules
// this migration hasn't built and so genuinely need a narrower
// allowlist (see individual.mjs's VITAL_FACT_TAGS doc comment).
// Source has no such tabs (record-page.phtml has none), so TITL is
// included here too even though it's ALSO shown in the page heading -
// confirmed this exact duplication is what real PHP does, not a
// guess. NOTE is still excluded: NoteStructure's value rendering needs
// its own multi-line-with-shared-note-record handling this simple
// renderer doesn't have yet, same class of deliberate cut as
// Individual/Family's own NOTE omission.
const SOURCE_FACT_TAGS = ['TITL', 'AUTH', 'PUBL', 'ABBR', 'TEXT', 'REPO', 'CHAN'];

/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableSourceFacts(facts) {
  return facts.filter((fact) => SOURCE_FACT_TAGS.includes(factTag(fact)));
}

// A subtag with a real translated label this migration happens to
// know (confirmed against app/Gedcom.php), overriding
// otherFactAttributes()'s raw-tag-path fallback - a real, common case
// in the imported tree (REPO facts with a CALN call-number line).
const SOURCE_SUBTAG_LABELS = {
  REPO: { CALN: 'Call number' },
};

// CHAN's _WT_USER is already hand-rendered elsewhere (the "Author of
// last change" line, matching real PHP's SOUR:CHAN:_WT_USER =>
// WebtreesUser element output exactly) - skip it here so it isn't
// shown twice.
const SOURCE_SUBTAG_EXTRA_SKIP = {
  CHAN: ['_WT_USER'],
};

/**
 * One fact's "other attributes" - every level-2 subtag not already
 * rendered by this route's own specific handling (date/time/author for
 * CHAN, the repository link for REPO) or excluded by the real denylist
 * (see individual.mjs's otherFactAttributes()). A real, common case in
 * the imported tree: `SOUR:TITL:_HEB` (a Hebrew transliteration of the
 * title) and `SOUR:REPO:CALN` (a repository call number).
 *
 * @param {string} factGedcom
 * @param {string} tag this fact's own top-level tag, e.g. 'TITL'
 * @returns {{label: string, value: string}[]}
 */
export function sourceFactOtherAttributes(factGedcom, tag) {
  const attributes = otherFactAttributes(factGedcom, SOURCE_SUBTAG_EXTRA_SKIP[tag] ?? []);

  return attributes.map(({ subtag, value }) => ({
    label: SOURCE_SUBTAG_LABELS[tag]?.[subtag] ?? `SOUR:${tag}:${subtag}`,
    value,
  }));
}

// Repository's own facts table (phase 5, RepositoryPage) - same
// "record-page-details.phtml has no tag allowlist at all" reasoning
// already confirmed for Source (app/GedcomRecord.php:552-570), applied
// to REPO's own real element set (app/Gedcom.php: NAME/ADDR/PHON/
// EMAIL/FAX/WWW/REFN/RIN/CHAN). NOTE is the one deliberate exclusion,
// same reasoning as Source's own NOTE cut (needs its own shared-note
// handling this simple renderer doesn't have yet).
const REPOSITORY_FACT_TAGS = ['NAME', 'ADDR', 'PHON', 'EMAIL', 'FAX', 'WWW', 'REFN', 'RIN', 'CHAN'];

/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableRepositoryFacts(facts) {
  return facts.filter((fact) => REPOSITORY_FACT_TAGS.includes(factTag(fact)));
}

// CHAN's _WT_USER already gets its own dedicated "Author of last
// change" rendering, same as Source's own CHAN handling - skip it here
// so it isn't shown twice.
const REPOSITORY_SUBTAG_EXTRA_SKIP = {
  CHAN: ['_WT_USER'],
};

/**
 * One fact's "other attributes" - see sourceFactOtherAttributes()'s own
 * doc comment for the shared mechanism. No known REPO-specific subtag
 * label overrides yet (unlike Source's REPO:CALN) - falls back to the
 * raw "REPO:<TAG>:<subtag>" path for anything encountered.
 *
 * @param {string} factGedcom
 * @param {string} tag this fact's own top-level tag, e.g. 'ADDR'
 * @returns {{label: string, value: string}[]}
 */
export function repositoryFactOtherAttributes(factGedcom, tag) {
  const attributes = otherFactAttributes(factGedcom, REPOSITORY_SUBTAG_EXTRA_SKIP[tag] ?? []);

  return attributes.map(({ subtag, value }) => ({ label: `REPO:${tag}:${subtag}`, value }));
}

/**
 * Mirrors Repository's privacy (no override - base
 * GedcomRecord::canShowByType() only) via the shared RESN chain.
 *
 * @param {{defaultResn: string|null}} tree individual-scoped default-resn
 *   info for THIS repository's own xref (loadDefaultResn(), reused as-is)
 * @param {string} gedcom the repository's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from the SAME loadDefaultResn() call
 * @returns {boolean}
 */
export function repositoryCanShowRecord(tree, gedcom, viewer, treeFactResn) {
  return canShowViaResnChain(tree, gedcom, viewer, () => defaultRecordCanShow(treeFactResn, 'REPO', viewer));
}

/**
 * Mirrors Source::canShowByType() (app/Source.php:36-49) exactly: hide
 * the source if ANY referenced repository can't be shown, else fall
 * back to the base per-record-type default.
 *
 * @param {{defaultResn: string|null}} tree
 * @param {string} gedcom the source's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer
 * @param {Map<string,string>} treeFactResn
 * @param {boolean[]} repoCanShowResults one per referenced repo that
 *   actually exists - matches Source::canShowByType()'s own
 *   `Registry::repositoryFactory()->make(...)` null-check (a broken
 *   reference is silently skipped, not treated as "hidden")
 * @returns {boolean}
 */
export function sourceCanShowRecord(tree, gedcom, viewer, treeFactResn, repoCanShowResults) {
  return canShowViaResnChain(tree, gedcom, viewer, () => {
    if (repoCanShowResults.some((shown) => !shown)) {
      return false;
    }

    return defaultRecordCanShow(treeFactResn, 'SOUR', viewer);
  });
}

/**
 * Every source in the tree (SourceListModule::handle(),
 * app/Module/SourceListModule.php:103-107 - `DB::table('sources')
 * ->where('s_file', '=', $tree->id())->get()`), ordered by xref - same
 * "real PHP has no explicit ORDER BY, DataTables sorts client-side"
 * reasoning as loadRepositoryList() above.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{xref: string, gedcom: string}[]>}
 */
export async function loadSourceList(pool, gedcomId) {
  const result = await pool.query('SELECT s_id, s_gedcom FROM wt_sources WHERE s_file = $1 ORDER BY s_id', [gedcomId]);

  return result.rows.map((row) => ({ xref: row.s_id, gedcom: row.s_gedcom }));
}

/**
 * Mirrors resources/views/lists/sources-table.phtml's own
 * `$count_individuals` query - a single grouped count of every SOUR-citing
 * `wt_link` row per source, joined to `wt_individuals` the same way the
 * real template joins to `individuals`. Deliberately NOT privacy-filtered,
 * same acknowledged shortcut as repositorySourceCounts() above.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function sourceIndividualCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_individuals
     JOIN wt_link ON l_from = i_id AND l_file = i_file
     WHERE l_type = 'SOUR' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors sources-table.phtml's `$count_families` query - same shape as
 * sourceIndividualCounts() above, joined to `wt_families` instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function sourceFamilyCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_families
     JOIN wt_link ON l_from = f_id AND l_file = f_file
     WHERE l_type = 'SOUR' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors sources-table.phtml's `$count_media` query - same shape as
 * sourceIndividualCounts() above, joined to `wt_media` instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function sourceMediaCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_media
     JOIN wt_link ON l_from = m_id AND l_file = m_file
     WHERE l_type = 'SOUR' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors sources-table.phtml's `$count_notes` query - every SOUR-citing
 * `wt_link` row whose `l_from` is a NOTE-typed `wt_other` row (same
 * "shared notes stored in the generic wt_other table" fact as
 * loadRepository() above), joined and filtered exactly like the real
 * template's own `o_type = 'NOTE'` clause.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function sourceNoteCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_other
     JOIN wt_link ON l_from = o_id AND l_file = o_file
     WHERE o_type = 'NOTE' AND l_type = 'SOUR' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * The first fact matching `tag`'s own plain value, e.g. a source's own
 * ABBR/AUTH line - mirrors sources-table.phtml's own
 * `$source->facts(['ABBR'])->isNotEmpty() ? ...->first()->value() : ''`
 * pattern. Returns '' when the source has no such fact, same as the
 * real template's own ternary fallback.
 *
 * @param {string} gedcom
 * @param {string} tag
 * @returns {string}
 */
export function firstFactPlainValue(gedcom, tag) {
  const fact = parseFacts(gedcom).find((f) => factTag(f) === tag);

  return fact ? factPlainValue(fact) : '';
}

/**
 * The tree's own SHOW_LAST_CHANGE preference, matching real PHP's
 * `(bool) $tree->getPreference('SHOW_LAST_CHANGE')` used by every one
 * of the "list" routes' own DataTables `data-columns` config
 * (repositories-table.phtml/sources-table.phtml/notes-table.phtml) to
 * decide whether the "Last change" column is visible at all - default
 * OFF (no `wt_gedcom_setting` row, unlike e.g. HIDE_LIVE_PEOPLE's own
 * '1' default), confirmed by grepping app/ for every
 * `setPreference('SHOW_LAST_CHANGE', ...)` call site: only
 * `TreePreferencesAction.php`'s own admin-settings-form write, never a
 * default seeded at tree-creation time. Same "'' and '0' are the only
 * falsy strings" PHP semantics already established for
 * `loadTreePrivacyPrefs()`'s own HIDE_LIVE_PEOPLE/USE_SILHOUETTE.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function loadShowLastChangePref(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name = 'SHOW_LAST_CHANGE'",
    [gedcomId],
  );
  const value = result.rows[0]?.setting_value ?? '';

  return value !== '' && value !== '0';
}
