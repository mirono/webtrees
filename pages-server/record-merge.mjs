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

// Data/logic layer for /tree/{tree}/merge-step1, /tree/{tree}/merge-step2
// (MergeRecordsPage/Action + MergeFactsPage/Action, phase 5 step 45) -
// the two-step "merge two records of the same type into one" admin
// wizard. Real PHP: app/Http/RequestHandlers/MergeRecordsPage.php,
// MergeRecordsAction.php, MergeFactsPage.php, MergeFactsAction.php,
// app/Services/LinkedRecordService.php::allLinkedRecords(),
// app/GedcomRecord.php::updateRecord()/deleteRecord()/parseFacts(),
// app/Services/PendingChangesService.php::acceptRecord(),
// app/Services/GedcomImportService.php::updateRecord($gedrec,$tree,$delete).
//
// Scope, per the user's explicit choices:
// - FULLY HONOR auto_accept_edits (wt_user_setting). A merge always
//   writes a real `wt_change` pending-change row first, exactly like
//   real PHP's per-record edit path (this is NOT one of this
//   migration's bulk admin operations like tree renumber/delete/merge,
//   which bypass `wt_change` entirely - record merge goes through the
//   same per-record path as an ordinary fact edit in real PHP, and
//   this port preserves that). Only if the acting user's own
//   `auto_accept_edits` preference is '1' is the pending change
//   immediately replayed into the live tables (the common admin-user
//   case) - otherwise it sits as a genuine pending change, visible to
//   a moderator once that review UI is built in a later step.
// - FULL TWO-STEP WIZARD, matching real PHP's fact-level granularity:
//   step 1 picks two same-type records; step 2 shows the real 3-bucket
//   fact comparison (facts identical in both / only in record1 / only
//   in record2, each individually checkbox-selectable) and commits the
//   merge with exactly the facts the user chose to keep.
// - UI SIMPLIFICATION (not a functional cut): real PHP's step-1 record
//   pickers are live-search autocomplete widgets. This port uses plain
//   `<select>` dropdowns populated with every record of the chosen
//   type instead - same end result (pick two xrefs of the same type),
//   simpler to build for an admin-only, occasional-use feature.
//
// Real correctness details worth flagging (all confirmed by reading
// real PHP directly, not assumed):
// - Fact matching between record1/record2 is EXACT md5 of the whole
//   level-1 fact block (tag + value + every sub-line) - not semantic.
//   A fact differing by even one character shows up as "only in
//   record1" AND "only in record2" (both pre-selected), never merged
//   as "the same fact". Replicated exactly, not "fixed".
// - The merged record's body is: xref1's kept facts (in xref1's
//   original order), then xref2's kept facts (in xref2's original
//   order) appended after - no interleaving/reordering, no
//   sub-field-level merge (a fact is kept wholesale or dropped
//   wholesale).
// - `allLinkedRecords()` finds every OTHER record pointing at xref2 via
//   BOTH the committed `wt_link` table AND any record with an
//   uncommitted pending change whose `new_gedcom` textually mentions
//   `@xref2@` (latest pending change per xref only) - a `wt_link`-only
//   query would miss in-flight edits.
// - Each linking record's gedcom is rewritten with a plain
//   `@xref2@` -> `@xref1@` substring replace, THEN a generic
//   exact-duplicate-level-1-block collapse (handles the case where the
//   linking record already pointed at both xref1 and xref2 via two
//   different facts, which would otherwise leave two identical facts
//   behind) - the collapse regex is a direct translation of real
//   PHP's own, un-scoped over the whole record text, not just the one
//   changed fact.
// - `wt_user_gedcom_setting`, `wt_block`, `wt_favorite` are repointed
//   directly; `wt_hit_counter` rows for xref1/xref2 are SUMMED per
//   page_name onto xref1, then xref2's rows are deleted outright (not
//   just repointed).
// - 8 record types are mergeable: individual/family/source/repository/
//   note/media/submitter/location (the `_LOC` custom type, stored in
//   `wt_other`) - matching real PHP's step-1 dropdown exactly.
// - Self-merge, type-mismatch, and already-pending-deletion guards are
//   re-checked independently at BOTH step 1 and step 2 submission, same
//   defense-in-depth real PHP uses across its 3 handlers.

import { parseFacts } from './individual.mjs';
import { insertTypedRecord, deleteRecordRows } from './gedcom-import.mjs';
import { createHash } from 'node:crypto';

export const MERGEABLE_TYPES = ['INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM', '_LOC'];

export const MERGEABLE_TYPE_LABELS = {
  INDI: 'Individual',
  FAM: 'Family',
  SOUR: 'Source',
  REPO: 'Repository',
  NOTE: 'Note',
  OBJE: 'Media object',
  SUBM: 'Submitter',
  _LOC: 'Location',
};

// Real PHP's Gedcom::RECORDS_WITH_CHAN (app/Gedcom.php) - not every
// record type gets a CHAN event on update.
const RECORD_TYPES_WITH_CHAN = new Set(['INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM']);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Finds the real table/current gedcom text/level-0 tag for a given
 * xref within a tree, trying each record table the same way real
 * PHP's `GedcomRecordFactory` does (by construction, not inheritance).
 *
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, type: string, gedcom: string}|null>}
 */
export async function getRecordByXref(client, gedcomId, xref) {
  const typedTables = [
    { type: 'INDI', sql: 'SELECT i_gedcom AS gedcom FROM wt_individuals WHERE i_id = $1 AND i_file = $2' },
    { type: 'FAM', sql: 'SELECT f_gedcom AS gedcom FROM wt_families WHERE f_id = $1 AND f_file = $2' },
    { type: 'SOUR', sql: 'SELECT s_gedcom AS gedcom FROM wt_sources WHERE s_id = $1 AND s_file = $2' },
    { type: 'OBJE', sql: 'SELECT m_gedcom AS gedcom FROM wt_media WHERE m_id = $1 AND m_file = $2' },
  ];

  for (const table of typedTables) {
    // eslint-disable-next-line no-await-in-loop
    const result = await client.query(table.sql, [xref, gedcomId]);
    if (result.rows.length > 0) {
      return { xref, type: table.type, gedcom: result.rows[0].gedcom };
    }
  }

  const otherResult = await client.query('SELECT o_type, o_gedcom FROM wt_other WHERE o_id = $1 AND o_file = $2', [xref, gedcomId]);

  if (otherResult.rows.length > 0) {
    return { xref, type: otherResult.rows[0].o_type, gedcom: otherResult.rows[0].o_gedcom };
  }

  return null;
}

/**
 * Lists every record of one mergeable type, for step 1's plain
 * `<select>` pickers - `[xref, displayLabel]` pairs, sorted by label.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} type one of MERGEABLE_TYPES
 * @returns {Promise<Array<{xref: string, label: string}>>}
 */
export async function listRecordsByType(pool, gedcomId, type) {
  let result;

  if (type === 'INDI') {
    result = await pool.query(
      `SELECT i.i_id AS xref, COALESCE(n.n_full, i.i_id) AS label
       FROM wt_individuals i
       LEFT JOIN wt_name n ON n.n_file = i.i_file AND n.n_id = i.i_id AND n.n_num = 0
       WHERE i.i_file = $1 ORDER BY label`,
      [gedcomId],
    );
  } else if (type === 'FAM') {
    result = await pool.query('SELECT f_id AS xref, f_id AS label FROM wt_families WHERE f_file = $1 ORDER BY label', [gedcomId]);
  } else if (type === 'SOUR') {
    result = await pool.query('SELECT s_id AS xref, s_name AS label FROM wt_sources WHERE s_file = $1 ORDER BY label', [gedcomId]);
  } else if (type === 'OBJE') {
    result = await pool.query('SELECT m_id AS xref, m_id AS label FROM wt_media WHERE m_file = $1 ORDER BY label', [gedcomId]);
  } else {
    result = await pool.query('SELECT o_id AS xref, o_id AS label FROM wt_other WHERE o_file = $1 AND o_type = $2 ORDER BY label', [
      gedcomId,
      type,
    ]);
  }

  return result.rows.map((row) => ({ xref: row.xref, label: row.label }));
}

/**
 * Mirrors `GedcomRecord::isPendingDeletion()` for a given xref: true if
 * its LATEST pending `wt_change` row has `new_gedcom = ''`.
 *
 * @param {import('pg').PoolClient|import('pg').Pool} client
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<boolean>}
 */
export async function isPendingDeletion(client, gedcomId, xref) {
  const result = await client.query(
    `SELECT new_gedcom FROM wt_change WHERE gedcom_id = $1 AND xref = $2 AND status = 'pending' ORDER BY change_id DESC LIMIT 1`,
    [gedcomId, xref],
  );
  return result.rows.length > 0 && result.rows[0].new_gedcom === '';
}

/**
 * Mirrors the identical 5-part validation guard real PHP repeats,
 * independently, in MergeRecordsAction/MergeFactsPage/MergeFactsAction:
 * both records must resolve, be distinct, be the same type, be a
 * mergeable type, and neither be already pending-deletion.
 *
 * @param {{xref: string, type: string, gedcom: string}|null} record1
 * @param {{xref: string, type: string, gedcom: string}|null} record2
 * @param {boolean} record1PendingDeletion
 * @param {boolean} record2PendingDeletion
 * @returns {string|null} an error message, or null if valid
 */
export function validateMergeSelection(record1, record2, record1PendingDeletion, record2PendingDeletion) {
  if (record1 === null || record2 === null) {
    return 'This record does not exist, or you do not have permission to access it.';
  }

  if (record1.xref === record2.xref) {
    return 'You cannot merge a record with itself.';
  }

  if (!MERGEABLE_TYPES.includes(record1.type) || !MERGEABLE_TYPES.includes(record2.type)) {
    return 'This type of record cannot be merged.';
  }

  if (record1.type !== record2.type) {
    return 'Records can only be merged with records of the same type.';
  }

  if (record1PendingDeletion || record2PendingDeletion) {
    return 'This record is already being deleted. You cannot merge it until that change has been accepted or rejected.';
  }

  return null;
}

function recordFacts(gedcom) {
  return parseFacts(gedcom).filter((fact) => /^1 /.test(fact) && !/^1 CHAN\b/.test(fact));
}

function factId(fact) {
  return createHash('md5').update(fact).digest('hex');
}

/**
 * Mirrors MergeFactsPage's 3-bucket split (app/Http/RequestHandlers/MergeFactsPage.php:82-89) -
 * an exact-text (md5) comparison of every non-CHAN level-1 fact block.
 * A fact appearing (byte-for-byte) in both records is bucketed only
 * once, under `both` (keeping record1's copy is sufficient since
 * they're identical); everything else only-in-one-side.
 *
 * Deliberate scope cut: this compares the records' current ACCEPTED
 * gedcom only, not merged with either record's own separate uncommitted
 * pending edit (a rare case: someone editing record1 or record2 while
 * a merge of it is also in flight) - real PHP's `facts()` would merge
 * those in. Narrow edge case, not reproduced.
 *
 * @param {string} gedcom1
 * @param {string} gedcom2
 * @returns {{both: Array<{id: string, gedcom: string}>, only1: Array<{id: string, gedcom: string}>, only2: Array<{id: string, gedcom: string}>}}
 */
export function compareFacts(gedcom1, gedcom2) {
  const facts1 = recordFacts(gedcom1).map((gedcom) => ({ id: factId(gedcom), gedcom }));
  const facts2 = recordFacts(gedcom2).map((gedcom) => ({ id: factId(gedcom), gedcom }));
  const ids1 = new Set(facts1.map((f) => f.id));
  const ids2 = new Set(facts2.map((f) => f.id));

  return {
    both: facts1.filter((f) => ids2.has(f.id)),
    only1: facts1.filter((f) => !ids2.has(f.id)),
    only2: facts2.filter((f) => !ids1.has(f.id)),
  };
}

/**
 * Mirrors MergeFactsAction's merged-body builder exactly
 * (app/Http/RequestHandlers/MergeFactsAction.php:122-131): the level-0
 * line, then every KEPT fact from record1 (its own original order),
 * then every KEPT fact from record2 (its own original order) appended
 * after - no interleaving, no sub-field merge.
 *
 * @param {string} xref1
 * @param {string} type
 * @param {string} gedcom1
 * @param {string} gedcom2
 * @param {string[]} keep1 fact ids to keep from record1
 * @param {string[]} keep2 fact ids to keep from record2
 * @returns {string}
 */
export function buildMergedGedcom(xref1, type, gedcom1, gedcom2, keep1, keep2) {
  const keep1Set = new Set(keep1);
  const keep2Set = new Set(keep2);

  let gedcom = `0 @${xref1}@ ${type}`;

  for (const fact of recordFacts(gedcom1)) {
    if (keep1Set.has(factId(fact))) {
      gedcom += `\n${fact}`;
    }
  }

  for (const fact of recordFacts(gedcom2)) {
    if (keep2Set.has(factId(fact))) {
      gedcom += `\n${fact}`;
    }
  }

  return gedcom;
}

/**
 * Mirrors `LinkedRecordService::allLinkedRecords()`
 * (app/Services/LinkedRecordService.php:48-74): every OTHER xref
 * pointing at `xref2`, via the UNION of the committed `wt_link` table
 * and any xref whose LATEST pending change textually mentions
 * `@xref2@` (excluding xref2's own pending change row, which would
 * otherwise self-match via its `0 @xref2@ TAG` line).
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {string} xref2
 * @returns {Promise<string[]>}
 */
export async function allLinkedXrefs(client, gedcomId, xref2) {
  const result = await client.query(
    `SELECT DISTINCT l_from AS xref FROM wt_link WHERE l_file = $1 AND l_to = $2
     UNION
     SELECT xref FROM (
       SELECT xref, new_gedcom,
              ROW_NUMBER() OVER (PARTITION BY xref ORDER BY change_id DESC) AS rn
       FROM wt_change WHERE gedcom_id = $1 AND status = 'pending'
     ) latest
     WHERE rn = 1 AND xref <> $2 AND new_gedcom LIKE '%@' || $2 || '@%'`,
    [gedcomId, xref2],
  );

  return result.rows.map((row) => row.xref);
}

// Direct translation of MergeFactsAction's own duplicate-block-collapse
// regex (app/Http/RequestHandlers/MergeFactsAction.php) - after the
// plain @xref2@ -> @xref1@ substitution, a linking record can end up
// with two identical level-1 blocks (it already pointed at both xref1
// and xref2 via different facts); this removes the FIRST occurrence of
// an exact-duplicate level-1-block-plus-children, keeping the later
// one. Un-scoped over the whole record text, matching real PHP.
const DUPLICATE_BLOCK_PATTERN = /(\n1.*@.+@.*(?:\n[2-9].*)*)((?:\n1.*(?:\n[2-9].*)*)*\1)/g;

/**
 * Rewrites one linking record's gedcom to point at xref1 instead of
 * xref2.
 *
 * @param {string} gedcom
 * @param {string} xref2
 * @param {string} xref1
 * @returns {string}
 */
export function rewriteLinkingGedcom(gedcom, xref2, xref1) {
  const swapped = gedcom.split(`@${xref2}@`).join(`@${xref1}@`);
  return swapped.replace(DUPLICATE_BLOCK_PATTERN, '$2');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Mirrors `GedcomRecord::updateChange()` (app/GedcomRecord.php:1009-1017):
 * strips any existing DATE/_WT_USER sub-lines from the passed CHAN
 * block, then appends a fresh DATE/TIME/_WT_USER stamped with the
 * acting user's name and the current moment.
 *
 * @param {string} chanBlock starting with "\n1 CHAN"
 * @param {string} author
 * @returns {string}
 */
function updateChange(chanBlock, author) {
  const stripped = chanBlock.replace(/\n2 (DATE|_WT_USER).*(\n[3-9].*)*/g, '');
  const now = new Date();
  const today = `${pad2(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  return `${stripped}\n2 DATE ${today}\n3 TIME ${time}\n2 _WT_USER ${author}`;
}

/**
 * Mirrors `GedcomRecord::updateRecord()`'s CHAN-update step
 * (app/GedcomRecord.php:769-790): replaces an existing `1 CHAN` block
 * (plus its children) in place, or appends a new one if absent. Only
 * record types in `RECORD_TYPES_WITH_CHAN` get this applied by callers.
 *
 * @param {string} gedcom
 * @param {string} author
 * @returns {string}
 */
export function updateChan(gedcom, author) {
  const match = /\n1 CHAN(\n[2-9].*)*/.exec(gedcom);

  if (match) {
    return gedcom.slice(0, match.index) + updateChange(match[0], author) + gedcom.slice(match.index + match[0].length);
  }

  return gedcom + updateChange('\n1 CHAN', author);
}

/**
 * Mirrors `GedcomRecord::updateRecord($gedcom, $update_chan)`
 * (app/GedcomRecord.php:769-808): normalizes line endings, optionally
 * updates CHAN, inserts a `wt_change` pending-change row, and - only if
 * the acting user's `auto_accept_edits` preference is on - immediately
 * replays it into the live tables via the same delete+reinsert pattern
 * `GedcomImportService::updateRecord($gedrec, $tree, false)` uses.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {number} userId
 * @param {boolean} autoAcceptEdits
 * @param {{xref: string, type: string, gedcom: string}} current the record's current (old) state
 * @param {string} newGedcomBody new content, NOT yet CHAN-stamped
 * @param {{updateChan: boolean, author: string}} options
 * @returns {Promise<void>}
 */
export async function applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, current, newGedcomBody, { updateChan: shouldUpdateChan, author }) {
  let gedcom = newGedcomBody.replace(/[\r\n]+/g, '\n').trim();

  if (shouldUpdateChan && RECORD_TYPES_WITH_CHAN.has(current.type)) {
    gedcom = updateChan(gedcom, author);
  }

  const changeResult = await client.query(
    `INSERT INTO wt_change (gedcom_id, xref, old_gedcom, new_gedcom, status, user_id)
     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING change_id`,
    [gedcomId, current.xref, current.gedcom, gedcom, userId],
  );

  if (autoAcceptEdits) {
    await deleteRecordRows(client, gedcomId, current.xref, current.type);
    await insertTypedRecord(client, gedcomId, current.xref, current.type, gedcom);
    await client.query("UPDATE wt_change SET status = 'accepted' WHERE change_id = $1", [changeResult.rows[0].change_id]);
  }
}

/**
 * Mirrors `GedcomRecord::deleteRecord()` (app/GedcomRecord.php:810-820):
 * inserts a `wt_change` row with `new_gedcom = ''`, and - only if
 * auto_accept_edits is on - immediately replays the delete into the
 * live tables.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {number} userId
 * @param {boolean} autoAcceptEdits
 * @param {{xref: string, type: string, gedcom: string}} current
 * @returns {Promise<void>}
 */
export async function applyRecordDelete(client, gedcomId, userId, autoAcceptEdits, current) {
  const changeResult = await client.query(
    `INSERT INTO wt_change (gedcom_id, xref, old_gedcom, new_gedcom, status, user_id)
     VALUES ($1, $2, $3, '', 'pending', $4) RETURNING change_id`,
    [gedcomId, current.xref, current.gedcom, userId],
  );

  if (autoAcceptEdits) {
    await deleteRecordRows(client, gedcomId, current.xref, current.type);
    await client.query("UPDATE wt_change SET status = 'accepted' WHERE change_id = $1", [changeResult.rows[0].change_id]);
  }
}

/**
 * Top-level orchestrator for MergeFactsAction - runs the whole merge in
 * one transaction (PHP's own merge is NOT transactional - a crash
 * partway through can leave links rewritten but record2 not yet
 * deleted; same "add the transaction PHP doesn't have" convention as
 * this bucket's other destructive operations).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {{userId: number, userName: string, autoAcceptEdits: boolean}} user
 * @param {string} xref1
 * @param {string} xref2
 * @param {string[]} keep1 fact ids to keep from record1
 * @param {string[]} keep2 fact ids to keep from record2
 * @returns {Promise<{error: string}|{error: null}>}
 */
export async function mergeRecordsTransactional(pool, gedcomId, user, xref1, xref2, keep1, keep2) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const record1 = await getRecordByXref(client, gedcomId, xref1);
    const record2 = await getRecordByXref(client, gedcomId, xref2);
    const record1Pending = record1 && (await isPendingDeletion(client, gedcomId, xref1));
    const record2Pending = record2 && (await isPendingDeletion(client, gedcomId, xref2));

    const validationError = validateMergeSelection(record1, record2, record1Pending, record2Pending);

    if (validationError) {
      await client.query('ROLLBACK');
      return { error: validationError };
    }

    // Repoint every record (committed or pending-mentioned) that links
    // to record2, across the whole tree.
    const linkingXrefs = await allLinkedXrefs(client, gedcomId, xref2);

    for (const linkingXref of linkingXrefs) {
      // eslint-disable-next-line no-await-in-loop
      const linkingRecord = await getRecordByXref(client, gedcomId, linkingXref);

      if (linkingRecord === null) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      if (await isPendingDeletion(client, gedcomId, linkingXref)) {
        continue;
      }

      const rewritten = rewriteLinkingGedcom(linkingRecord.gedcom, xref2, xref1);

      // eslint-disable-next-line no-await-in-loop
      await applyRecordUpdate(client, gedcomId, user.userId, user.autoAcceptEdits, linkingRecord, rewritten, {
        updateChan: true,
        author: user.userName,
      });
    }

    // user_gedcom_setting ('gedcomid'/'rootid' - a user's linked/home
    // individual).
    await client.query(
      `UPDATE wt_user_gedcom_setting SET setting_value = $1
       WHERE gedcom_id = $2 AND setting_value = $3 AND setting_name IN ('gedcomid', 'rootid')`,
      [xref1, gedcomId, xref2],
    );

    // Stories/blocks.
    await client.query('UPDATE wt_block SET xref = $1 WHERE gedcom_id = $2 AND xref = $3', [xref1, gedcomId, xref2]);

    // hit_counter: SUM page_count per page_name onto xref1, drop xref2's rows.
    const hitCounterRows = await client.query(
      `SELECT page_name, SUM(page_count) AS total FROM wt_hit_counter
       WHERE gedcom_id = $1 AND page_parameter IN ($2, $3) GROUP BY page_name`,
      [gedcomId, xref1, xref2],
    );

    for (const row of hitCounterRows.rows) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO wt_hit_counter (gedcom_id, page_name, page_parameter, page_count) VALUES ($1, $2, $3, $4)
         ON CONFLICT (gedcom_id, page_name, page_parameter) DO UPDATE SET page_count = $4`,
        [gedcomId, row.page_name, xref1, Number(row.total)],
      );
    }

    await client.query('DELETE FROM wt_hit_counter WHERE gedcom_id = $1 AND page_parameter = $2', [gedcomId, xref2]);

    // favorite.
    await client.query('UPDATE wt_favorite SET xref = $1 WHERE gedcom_id = $2 AND xref = $3', [xref1, gedcomId, xref2]);

    // Build and write the merged record1, then delete record2.
    const mergedGedcom = buildMergedGedcom(xref1, record1.type, record1.gedcom, record2.gedcom, keep1, keep2);

    await applyRecordUpdate(client, gedcomId, user.userId, user.autoAcceptEdits, record1, mergedGedcom, {
      updateChan: true,
      author: user.userName,
    });

    // record1's in-memory `current.gedcom` is stale after the update
    // above if auto-accept just rewrote the live row - re-fetch isn't
    // needed since record2's delete only needs record2's own current
    // state, which applyRecordUpdate() never touched.
    await applyRecordDelete(client, gedcomId, user.userId, user.autoAcceptEdits, record2);

    await client.query('COMMIT');
    return { error: null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
