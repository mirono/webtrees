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

// Data/logic layer for /tree/{tree}/header/{xref} (HeaderPage) - the
// eighth real-GEDCOM-record route. A GEDCOM header (`0 HEAD`) has no
// real `@xref@` of its own - webtrees addresses it with the literal
// pseudo-xref "HEAD" (confirmed: the real imported tree's one `wt_other`
// row of type HEAD has `o_id = 'HEAD'`). Same generic 'record-page'/
// 'record-page-details' shape as Submitter (no dedicated template, no
// tag allowlist - app/GedcomRecord.php:552-570), same "no
// canShowByType() override" privacy shape (app/Header.php's class body
// has only extractNames()). See
// docs/php-to-js-migration/phase5-header-page.md.
//
// Header::extractNames() (app/Header.php:33-40) is UNIQUE among every
// record type ported so far: it doesn't derive a name from any GEDCOM
// fact at all - it always pushes the single literal translated string
// "Header", regardless of content.

import { canShowViaResnChain, otherFactAttributes } from './individual.mjs';

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref in practice always the literal "HEAD" - any other
 *   value correctly finds no matching row, same as every other
 *   loadX(pool, gedcomId, xref) in this migration
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadHeader(pool, gedcomId, xref) {
  const result = await pool.query("SELECT o_id, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2 AND o_type = 'HEAD'", [
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
// wt_default_resn row exists for this record type (tag_type = 'HEAD',
// xref IS NULL) - same shape already confirmed for NOTE/OBJE/REPO/SOUR/SUBM.
function defaultRecordCanShow(treeFactResn, viewer) {
  const resn = treeFactResn.get('HEAD') ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

/**
 * Mirrors Header's privacy (no canShowByType() override - base
 * GedcomRecord::canShowByType() only), same shared RESN chain already
 * built for Individual/Family/Source/Repository/Note/Media/Submitter.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree
 * @param {string} gedcom the header's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   always false (the self-record exception is individual-only)
 * @param {Map<string,string>} treeFactResn from loadDefaultResn()
 * @returns {boolean}
 */
export function headerCanShowRecord(tree, gedcom, viewer, treeFactResn) {
  return canShowViaResnChain(tree, gedcom, viewer, () => defaultRecordCanShow(treeFactResn, viewer));
}

// Header's own facts table - same "no tag allowlist" reasoning already
// confirmed for Submitter: every level-1 fact is shown, privacy-filtered
// only. Real facts on the actual imported tree's header: SOUR (an
// "Application ID", e.g. "webtrees" - NOT a source citation, a
// different real element than every other record type's own SOUR tag),
// DEST, DATE, GEDC, CHAR, FILE, SUBM (a real link to the submitter who
// created the export - resolved in index.mjs's handler, mirroring
// source.mjs's own REPO-citation resolution).
// See submitter.mjs's displayableSubmitterFacts() for why the leading
// "0 HEAD" pseudo-fact block (facts[0], from parseFacts()'s pure
// "\n1"-boundary split) must be filtered explicitly here - this
// route's facts table has no tag allowlist to drop it for free.
/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableHeaderFacts(facts) {
  return facts.filter((fact) => fact.startsWith('1 '));
}

// GEDC's VERS/FORM and SOUR's NAME/VERS subtags have real, known
// translated labels (app/Gedcom.php) - overriding otherFactAttributes()'s
// raw-tag-path fallback, the same pattern already established for
// SOUR:REPO:CALN in source.mjs.
const HEADER_SUBTAG_LABELS = {
  GEDC: { VERS: 'Version', FORM: 'Format' },
  SOUR: { NAME: 'Application name', VERS: 'Version' },
};

// DATE's own TIME subtag already gets its own dedicated rendering
// (extracted directly into the fact's `time` field in index.mjs's
// handler, same as CHAN's own DATE/TIME) - skip it here so it isn't
// shown twice. otherFactAttributes()'s own denylist already skips
// 'DATE' as a SUBTAG of some other fact (e.g. a nested date under an
// event), which doesn't help here since DATE is the fact's own
// top-level tag and TIME is what's nested beneath it - the opposite
// shape, needing its own explicit skip, same mechanism as CHAN's
// _WT_USER in every other record type's own facts table.
const HEADER_SUBTAG_EXTRA_SKIP = {
  DATE: ['TIME'],
};

/**
 * One fact's "other attributes" - see source.mjs's sourceFactOtherAttributes()
 * own doc comment for the shared mechanism.
 *
 * @param {string} factGedcom
 * @param {string} tag this fact's own top-level tag, e.g. 'GEDC'
 * @returns {{label: string, value: string}[]}
 */
export function headerFactOtherAttributes(factGedcom, tag) {
  const attributes = otherFactAttributes(factGedcom, HEADER_SUBTAG_EXTRA_SKIP[tag] ?? []);

  return attributes.map(({ subtag, value }) => ({
    label: HEADER_SUBTAG_LABELS[tag]?.[subtag] ?? `HEAD:${tag}:${subtag}`,
    value,
  }));
}
