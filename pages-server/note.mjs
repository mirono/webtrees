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

// Shared-Note data/logic - used by IndividualPage's Notes tab (phase 5
// step 14c - docs/php-to-js-migration/phase5-individual-page-full.md).
// Notes have no dedicated table (same as Repository, source.mjs's own
// loadRepository()) - stored in the generic wt_other table,
// discriminated by o_type = 'NOTE'. Note extends GedcomRecord and
// shares its canShowRecord() verbatim, with NO canShowByType()
// override (same as Repository) - base GedcomRecord::canShowByType()
// applies unmodified.

import { canShowViaResnChain } from './individual.mjs';

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
 * Mirrors Note's privacy (no canShowByType() override - base
 * GedcomRecord::canShowByType() only), same shared RESN chain already
 * built for Individual/Family/Source/Repository.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree individual-scoped
 *   default-resn info for THIS note's own xref (loadDefaultResn(), reused as-is)
 * @param {string} gedcom the note's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from the SAME loadDefaultResn() call
 * @returns {boolean}
 */
export function noteCanShowRecord(tree, gedcom, viewer, treeFactResn) {
  return canShowViaResnChain(tree, gedcom, viewer, () => defaultRecordCanShow(treeFactResn, viewer));
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
