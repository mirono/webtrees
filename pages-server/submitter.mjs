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

// Data/logic layer for /tree/{tree}/submitter/{xref} (SubmitterPage) -
// the seventh and (per the migration's current record-type coverage)
// last of the "generic record-page" routes. Submitter has no dedicated
// table (same as Repository/Note/Media) - stored in the generic
// wt_other table, discriminated by o_type = 'SUBM'. `app/Submitter.php`
// has NO canShowByType() override at all (confirmed by its near-empty
// class body - just extractNames()) - same shared RESN chain, no extra
// linked-record check, matching Repository's own privacy shape exactly
// (unlike Note/Media, which DO have one - see phase5-note-page.md).
//
// Real PHP renders this route through the generic 'record-page'/
// 'record-page-details' shared views (app/Http/RequestHandlers/
// SubmitterPage.php uses 'record-page', not a dedicated
// 'submitter-page' template) - the SAME "no tag allowlist, every fact
// shown, privacy-filtered only" shape already confirmed for Source/
// Repository/Note/Media (app/GedcomRecord.php:552-570). See
// docs/php-to-js-migration/phase5-submitter-page.md.

import { canShowViaResnChain, otherFactAttributes } from './individual.mjs';

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadSubmitter(pool, gedcomId, xref) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2 AND o_type = 'SUBM'", [
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
// wt_default_resn row exists for this record type (tag_type = 'SUBM',
// xref IS NULL) - same shape already confirmed for NOTE/OBJE/REPO/SOUR.
function defaultRecordCanShow(treeFactResn, viewer) {
  const resn = treeFactResn.get('SUBM') ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

/**
 * Mirrors Submitter's privacy (no canShowByType() override - base
 * GedcomRecord::canShowByType() only), same shared RESN chain already
 * built for Individual/Family/Source/Repository/Note/Media.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree
 * @param {string} gedcom the submitter's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from loadDefaultResn()
 * @returns {boolean}
 */
export function submitterCanShowRecord(tree, gedcom, viewer, treeFactResn) {
  return canShowViaResnChain(tree, gedcom, viewer, () => defaultRecordCanShow(treeFactResn, viewer));
}

// Submitter's own facts table - same "no tag allowlist" reasoning
// already confirmed for Source/Repository/Note/Media
// (app/GedcomRecord.php:552-570): every level-1 fact is shown,
// privacy-filtered only. Unlike Repository's route, this one has no
// exclusion at all - real record-page-details.phtml's own loop
// (`$record->facts([], true)`) has zero filtering beyond privacy.
/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableSubmitterFacts(facts) {
  return facts;
}

// CHAN's _WT_USER already gets its own dedicated "Author of last
// change" rendering, same as every other record type's CHAN handling -
// skip it here so it isn't shown twice.
const SUBMITTER_SUBTAG_EXTRA_SKIP = {
  CHAN: ['_WT_USER'],
};

/**
 * One fact's "other attributes" - see source.mjs's sourceFactOtherAttributes()
 * own doc comment for the shared mechanism. No known SUBM-specific
 * subtag label overrides yet - falls back to the raw "SUBM:<TAG>:<subtag>"
 * path for anything encountered.
 *
 * @param {string} factGedcom
 * @param {string} tag this fact's own top-level tag, e.g. 'ADDR'
 * @returns {{label: string, value: string}[]}
 */
export function submitterFactOtherAttributes(factGedcom, tag) {
  const attributes = otherFactAttributes(factGedcom, SUBMITTER_SUBTAG_EXTRA_SKIP[tag] ?? []);

  return attributes.map(({ subtag, value }) => ({ label: `SUBM:${tag}:${subtag}`, value }));
}
