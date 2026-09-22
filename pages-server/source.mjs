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

import { canShowViaResnChain, otherFactAttributes } from './individual.mjs';

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
