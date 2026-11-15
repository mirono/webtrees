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

// Core fact/record mutation logic for editing Phase B (phase 5 step
// 48): AddNewFact/SelectNewFact, EditFactPage/Action, DeleteFact,
// CopyFact/PasteFact, EditRawFactPage/Action, EditRawRecordPage/Action,
// EditRecordPage/Action - the first routes to actually WRITE through
// Phase A's foundation (gedcom-edit-service.mjs/gedcom-edit-widgets.mjs).
//
// Scope cuts, consistent with this migration's existing conventions:
//   - Pending (unsaved editor) changes are NOT layered onto the fact
//     list shown/edited, matching every other already-ported record
//     page (see individual.mjs's own doc comment). A record with an
//     outstanding pending edit still shows/edits its last COMMITTED
//     gedcom; the pending wt_change row itself is untouched by these
//     routes (same "pending changes are a separate, unported
//     reviewer-queue feature" boundary already drawn elsewhere).
//   - `Auth::checkRecordAccess($record, true)`'s own fallback - when
//     canEdit() fails but canShow() still succeeds, real PHP lets the
//     request through anyway (edit handlers mutate without a second
//     gate) - is NOT replicated. This port denies outright whenever
//     canEditRecord() is false. The only way these differ is a
//     RESN=LOCKED or pending-deletion record reached by a tree editor
//     who also happens to have (member-level) view access - denying is
//     strictly safer there, never a loss of a legitimate edit.
//   - CensusAssistantModule's extra per-individual fan-out
//     (EditFactAction's `ca_individuals` handling) is cut - that
//     module is itself unported.
//   - `GedcomRecord::lock()` (a `SELECT ... FOR UPDATE` row lock) is
//     not replicated - `applyRecordUpdate()`/`applyRecordDelete()`
//     (record-merge.mjs) already run inside a transaction at the
//     call site, which is this migration's established substitute
//     (see step 41's tree-management transactions for the same call).

import { createHash } from 'node:crypto';
import { elementFor } from './gedcom-edit-service.mjs';

/** Mirrors GedcomRecord::parseFacts()'s fact ID scheme: md5 of the exact level-1+ GEDCOM block. */
export function factId(factGedcom) {
  return createHash('md5').update(factGedcom, 'utf8').digest('hex');
}

/**
 * Mirrors GedcomRecord::parseFacts() (app/GedcomRecord.php:911-945)
 * MINUS the pending-changes overlay (see file doc comment) - splits a
 * full record's GEDCOM (including its level-0 line) into one block
 * per level-1 fact, each tagged with its real `Fact::id()` (md5 of the
 * block) and bare tag name.
 *
 * @param {string} gedcom Full record GEDCOM, starting "0 @XREF@ TAG ..."
 * @returns {Array<{id: string, tag: string, gedcom: string}>}
 */
export function splitFacts(gedcom) {
  const blocks = gedcom.split(/\n(?=1)/);
  blocks.shift(); // the level-0 line

  return blocks
    .filter((block) => block !== '')
    .map((block) => {
      const match = /^1 (\S+)/.exec(block);
      return { id: factId(block), tag: match ? match[1] : '', gedcom: block };
    });
}

/** The level-0 line of a record's GEDCOM (everything before the first newline). */
export function level0Line(gedcom) {
  return gedcom.split('\n', 1)[0];
}

/**
 * Rebuilds a full record's GEDCOM from its level-0 line plus an
 * ordered list of fact blocks.
 */
export function buildRecordGedcom(level0, facts) {
  return [level0, ...facts].join('\n');
}

/**
 * Mirrors GedcomRecord::createFact() (app/GedcomRecord.php:687-712):
 * inserts a new fact block, optionally before an existing fact (by
 * id), else at the end. Returns the FULL new record GEDCOM.
 *
 * @param {string} currentGedcom Full record GEDCOM.
 * @param {string} newFactGedcom e.g. "1 OCCU farmer"
 * @param {string|null} [beforeFactId]
 */
export function createFactGedcom(currentGedcom, newFactGedcom, beforeFactId = null) {
  const facts = splitFacts(currentGedcom);
  const result = [];
  let inserted = false;

  for (const fact of facts) {
    if (!inserted && fact.id === beforeFactId) {
      result.push(newFactGedcom);
      inserted = true;
    }
    result.push(fact.gedcom);
  }

  if (!inserted) {
    result.push(newFactGedcom);
  }

  return buildRecordGedcom(level0Line(currentGedcom), result);
}

/**
 * Mirrors GedcomRecord::updateFact() (app/GedcomRecord.php:732-767),
 * replacing the first fact whose id matches. Returns the FULL new
 * record GEDCOM (unchanged - i.e. the fact is silently dropped from
 * the output - if no fact matches, same as real PHP's own loop, which
 * never re-adds a fact it didn't find).
 */
export function updateFactGedcom(currentGedcom, factIdToUpdate, newFactGedcom) {
  const facts = splitFacts(currentGedcom);
  let updated = false;

  const result = facts.map((fact) => {
    if (!updated && fact.id === factIdToUpdate) {
      updated = true;
      return newFactGedcom;
    }
    return fact.gedcom;
  });

  return buildRecordGedcom(level0Line(currentGedcom), result);
}

/**
 * Mirrors GedcomRecord::deleteFact() (app/GedcomRecord.php:714-730) -
 * removes the FIRST fact matching the given id ("two identical facts?
 * only delete one of them", same comment as real PHP's DeleteFact
 * handler).
 */
export function deleteFactGedcom(currentGedcom, factIdToDelete) {
  const facts = splitFacts(currentGedcom);
  let deleted = false;

  const result = facts.filter((fact) => {
    if (!deleted && fact.id === factIdToDelete) {
      deleted = true;
      return false;
    }
    return true;
  });

  return buildRecordGedcom(level0Line(currentGedcom), result.map((fact) => fact.gedcom));
}

/** The value of a fact's own level-2 subtag, e.g. the fact's own "2 RESN ..." line. */
function factSubtagValue(factGedcom, subtag) {
  const match = new RegExp(`\\n2 ${subtag} ?(.*)`).exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * Mirrors GedcomRecord::canEdit() (app/GedcomRecord.php:246-260):
 * record-level gate for EditRecordPage/Action, EditRawRecordPage/Action,
 * AddNewFact, EditFactPage (the initial "may the user touch this
 * record at all" check `Auth::checkRecordAccess($record, true)` runs,
 * before per-fact checks).
 *
 * @param {object} params
 * @param {boolean} params.isPendingDeletion
 * @param {boolean} params.isManager
 * @param {boolean} params.isEditor
 * @param {Array<{tag: string, gedcom: string}>} params.facts From `splitFacts()`.
 */
export function canEditRecord({ isPendingDeletion, isManager, isEditor, facts }) {
  if (isPendingDeletion) {
    return false;
  }

  if (isManager) {
    return true;
  }

  const resnFact = facts.find((fact) => fact.tag === 'RESN');
  const locked = resnFact !== undefined && resnFact.gedcom.replace(/^1 RESN ?/, '').trim().endsWith('LOCKED');

  return isEditor && !locked;
}

/**
 * Mirrors Fact::canEdit() (app/Fact.php:243-255): per-fact gate for
 * DeleteFact, CopyFact, and EditFactPage's own fact lookup. Members
 * (non-managers) cannot edit RESN or CHAN facts, nor a fact carrying
 * its own "2 RESN ... LOCKED" subtag.
 *
 * @param {object} params
 * @param {boolean} params.isPendingDeletion Whole-RECORD pending deletion (Fact::canEdit() delegates to isPendingDeletion() which is record-level).
 * @param {boolean} params.isManager
 * @param {boolean} params.isEditor
 * @param {string} params.tag Bare level-1 tag, e.g. 'BIRT'.
 * @param {string} params.factGedcom
 */
export function canEditFact({ isPendingDeletion, isManager, isEditor, tag, factGedcom }) {
  if (isPendingDeletion) {
    return false;
  }

  if (isManager) {
    return true;
  }

  const resn = factSubtagValue(factGedcom, 'RESN');

  return isEditor && !resn.trim().endsWith('LOCKED') && tag !== 'RESN' && tag !== 'CHAN';
}

/** Record types real PHP lets a user CHAN-stamp (Gedcom::RECORDS_WITH_CHAN). */
export const RECORD_TYPES_WITH_CHAN = new Set(['INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM']);

/** `GedcomRecord::url()`'s route segment per record type. */
const RECORD_URL_SEGMENTS = {
  INDI: 'individual',
  FAM: 'family',
  SOUR: 'source',
  REPO: 'repository',
  NOTE: 'note',
  OBJE: 'media',
  SUBM: 'submitter',
};

/**
 * @param {string} treeName
 * @param {string} type
 * @param {string} xref
 * @returns {string}
 */
export function recordUrl(treeName, type, xref) {
  const segment = RECORD_URL_SEGMENTS[type] ?? 'record';
  return `/tree/${encodeURIComponent(treeName)}/${segment}/${encodeURIComponent(xref)}`;
}

/**
 * A short display label for a fact, used as the raw-GEDCOM-edit card
 * header - a deliberately reduced version of Fact::label()/summary()
 * (which format dates, resolve link targets, special-case marriage
 * TYPE, etc.) since the raw-edit page is explicitly the "advanced,
 * bypass the usual forms" page: identifying which block is which is
 * all it needs to do.
 *
 * @param {string} recordTag
 * @param {string} tag Bare level-1 tag, e.g. 'BIRT'.
 * @param {string} factGedcom
 */
export function factSummaryLabel(recordTag, tag, factGedcom) {
  const element = elementFor(`${recordTag}:${tag}`);
  const firstLine = factGedcom.split('\n', 1)[0];
  const value = firstLine.replace(new RegExp(`^1 ${tag} ?`), '').trim();

  if (value === '' || value === 'Y') {
    return element.label || tag;
  }

  return `${element.label || tag}: ${value}`;
}

// Mirrors ClipboardService::CLIPBOARD_SIZE.
const CLIPBOARD_SIZE = 10;

/**
 * Mirrors ClipboardService::copyFact() - mutates `session.clipboard`
 * (a `{[recordType]: {[factId]: factGedcom}}` object, matching real
 * PHP's own nested associative array) in place.
 *
 * @param {Record<string, unknown>} session
 * @param {string} recordType
 * @param {string} copiedFactId
 * @param {string} factGedcom
 */
export function copyFactToClipboard(session, recordType, copiedFactId, factGedcom) {
  if (typeof session.clipboard !== 'object' || session.clipboard === null) {
    session.clipboard = {};
  }

  const forType = { ...(session.clipboard[recordType] ?? {}) };

  // "If we are copying the same fact twice, make sure the new one is at the end."
  delete forType[copiedFactId];
  forType[copiedFactId] = factGedcom;

  const entries = Object.entries(forType).slice(-CLIPBOARD_SIZE);
  session.clipboard[recordType] = Object.fromEntries(entries);
}

/**
 * Mirrors ClipboardService::pasteFact() - returns the clipped GEDCOM
 * for `factId` under `recordType`, or `null` if not present.
 *
 * @param {Record<string, unknown>} session
 * @param {string} recordType
 * @param {string} pastedFactId
 * @returns {string|null}
 */
export function pasteFactFromClipboard(session, recordType, pastedFactId) {
  const forType = session.clipboard?.[recordType];
  return typeof forType === 'object' && forType !== null && pastedFactId in forType ? forType[pastedFactId] : null;
}
