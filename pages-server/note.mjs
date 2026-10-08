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

// Shared-Note data/logic - originally built for IndividualPage's Notes
// tab (phase 5 step 14c), now also backing the standalone NotePage
// route (phase 5 step 16 - docs/php-to-js-migration/phase5-note-page.md).
// Notes have no dedicated table (same as Repository, source.mjs's own
// loadRepository()) - stored in the generic wt_other table,
// discriminated by o_type = 'NOTE'.
//
// UNLIKE Repository, Note::canShowByType() (app/Note.php:58-75) DOES
// have a real override: a note is hidden whenever ANY record linking
// to it (via wt_link) is itself unshowable - "hide notes attached to
// private records". noteCanShowRecord() below takes this as a
// precomputed `linkedRecordsShowable` boolean rather than querying
// wt_link itself, matching this migration's established pattern of
// keeping DB access in pages-server/index.mjs's handlers and privacy
// *decisions* in these per-record-type modules (see
// sourceCanShowRecord()'s own repoCanShowResults parameter for the
// same shape).

import { canShowViaResnChain } from './individual.mjs';

function factTag(factGedcom) {
  return /^1 (\S+)/.exec(factGedcom)?.[1] ?? '';
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadNote(pool, gedcomId, xref) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2 AND o_type = 'NOTE'", [
    xref,
    gedcomId,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].o_id, gedcom: result.rows[0].o_gedcom };
}

// Base GedcomRecord::canShowByType() (app/GedcomRecord.php:841-852)'s
// own record-type-level default: PUBLIC unless a tree-wide
// wt_default_resn row exists for this record type (tag_type = 'NOTE',
// xref IS NULL) - same shape already confirmed for REPO/SOUR in
// source.mjs.
function defaultRecordCanShow(treeFactResn, viewer) {
  const resn = treeFactResn.get('NOTE') ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

/**
 * Mirrors Note::canShowByType() (app/Note.php:58-75) via the shared RESN
 * chain: hidden whenever any record linking to this note is itself
 * unshowable, otherwise base GedcomRecord::canShowByType() applies.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree individual-scoped
 *   default-resn info for THIS note's own xref (loadDefaultResn(), reused as-is)
 * @param {string} gedcom the note's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from the SAME loadDefaultResn() call
 * @param {boolean} linkedRecordsShowable false if ANY record linking to
 *   this note (via wt_link) is itself unshowable to this viewer
 * @returns {boolean}
 */
export function noteCanShowRecord(tree, gedcom, viewer, treeFactResn, linkedRecordsShowable) {
  return canShowViaResnChain(tree, gedcom, viewer, () => linkedRecordsShowable && defaultRecordCanShow(treeFactResn, viewer));
}

// Note's own facts table (phase 5 step 16, NotePage) - same "no tag
// allowlist" reasoning already confirmed for Source/Repository
// (app/GedcomRecord.php:552-570): every level-1 fact is shown,
// privacy-filtered only. NOTE:CONT/CONC are excluded defensively,
// mirroring note-page-details.phtml's own `$fact->tag() !== 'NOTE:CONT'`
// guard - parseFacts() only ever returns level-1 tags in practice, so
// this is a safety net, not a real-world-reachable case.
//
// ALSO excludes parseFacts()'s own leading "0 @xref@ NOTE ..." pseudo-
// fact block (facts[0] always, since the split is purely "\n1"-boundary
// based, with no level-0-vs-1 awareness) - a real bug, found live,
// fixed retroactively: rendered as an extra "undefined"-labeled row on
// every note. See submitter.mjs's displayableSubmitterFacts() for the
// same fix applied there.
/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableNoteFacts(facts) {
  return facts.filter((fact) => fact.startsWith('1 ') && !['CONT', 'CONC'].includes(factTag(fact)));
}

/**
 * Every shared note in the tree (NoteListModule::handle(),
 * app/Module/NoteListModule.php:93-98 - `DB::table('other')
 * ->where('o_file', '=', $tree->id())->where('o_type', '=',
 * Note::RECORD_TYPE)->get()`), ordered by xref - same "real PHP has no
 * explicit ORDER BY, DataTables sorts client-side" reasoning already
 * established for loadRepositoryList()/loadSourceList() in source.mjs.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{xref: string, gedcom: string}[]>}
 */
export async function loadNoteList(pool, gedcomId) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_file = $1 AND o_type = 'NOTE' ORDER BY o_id", [gedcomId]);

  return result.rows.map((row) => ({ xref: row.o_id, gedcom: row.o_gedcom }));
}

/**
 * Mirrors resources/views/lists/notes-table.phtml's own `$count_individuals`
 * query - a single grouped count of every NOTE-citing `wt_link` row per
 * shared note, joined to `wt_individuals`. Deliberately NOT privacy-
 * filtered, same acknowledged shortcut as source.mjs's own
 * repositorySourceCounts()/sourceIndividualCounts().
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function noteIndividualCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_individuals
     JOIN wt_link ON l_from = i_id AND l_file = i_file
     WHERE l_type = 'NOTE' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors notes-table.phtml's `$count_families` query - same shape as
 * noteIndividualCounts() above, joined to `wt_families` instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function noteFamilyCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_families
     JOIN wt_link ON l_from = f_id AND l_file = f_file
     WHERE l_type = 'NOTE' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors notes-table.phtml's `$count_media` query - same shape as
 * noteIndividualCounts() above, joined to `wt_media` instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function noteMediaCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_media
     JOIN wt_link ON l_from = m_id AND l_file = m_file
     WHERE l_type = 'NOTE' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * Mirrors notes-table.phtml's `$count_sources` query - same shape as
 * noteIndividualCounts() above, joined to `wt_sources` instead.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Map<string, number>>}
 */
export async function noteSourceCounts(pool, gedcomId) {
  const result = await pool.query(
    `SELECT l_to, COUNT(*) AS total
     FROM wt_sources
     JOIN wt_link ON l_from = s_id AND l_file = s_file
     WHERE l_type = 'NOTE' AND l_file = $1
     GROUP BY l_to`,
    [gedcomId],
  );

  return new Map(result.rows.map((row) => [row.l_to, Number(row.total)]));
}

/**
 * A shared note's own text (mirrors Note::getNote() - app/Note.php -
 * the record's own "0 @Nxref@ NOTE <value>" line plus CONT
 * continuations), joined into one string.
 *
 * @param {string} noteGedcom
 * @returns {string}
 */
export function noteText(noteGedcom) {
  const lines = noteGedcom.split('\n');
  const firstLine = lines[0] ?? '';
  const valueMatch = /^0 @[^@]+@ NOTE ?(.*)$/.exec(firstLine);
  const parts = [valueMatch ? valueMatch[1] : ''];

  for (const line of lines.slice(1)) {
    const contMatch = /^1 CONT ?(.*)$/.exec(line);
    const concMatch = /^1 CONC ?(.*)$/.exec(line);

    if (contMatch) {
      parts.push(contMatch[1]);
    } else if (concMatch) {
      parts[parts.length - 1] += concMatch[1];
    }
  }

  return parts.join('\n');
}
