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

// Editing Phase C (phase 5 step 50): relationship editing -
// AddChildToFamily, AddSpouseToFamily, AddChildToIndividual,
// AddParentToIndividual, AddSpouseToIndividual, AddUnlinkedIndividual,
// LinkChildToFamily, LinkSpouseToIndividual, DeleteRecord. Deferred to
// a later phase: ChangeFamilyMembers (reassigns an EXISTING family's
// whole membership - a materially different, more complex shape; the
// user confirmed this grouping).
//
// The core new primitive Phase A/B didn't need: CREATING a record.
// Mirrors Tree::createRecord()/createIndividual()/createFamily()
// (app/Tree.php:421-516) - allocates a new xref (generateXref(),
// already built for step 41's RenumberTreeAction), unconditionally
// CHAN-stamps (real PHP's createRecord() has no `update_chan` flag,
// unlike updateRecord()), inserts a pending wt_change row with
// old_gedcom='', and - only if auto_accept_edits is on - also inserts
// the real typed-table row immediately (reusing
// insertTypedRecord()/applyRecordUpdate() from the existing GEDCOM-
// import/record-merge infra, same as every other mutation this
// migration has built).
//
// A newly-created record that ALSO needs a follow-up linking fact in
// the SAME request (e.g. the new child needs its FAMC fact right
// after creation) can't be re-read via getRecordByXref() - the typed
// table has no row yet unless auto-accepted. Mirrors real PHP's own
// GedcomRecord object carrying BOTH `$this->gedcom` (what's actually
// committed - '' until accepted) and `$this->pending` (the running
// in-memory content) for exactly this reason - callers here track the
// equivalent as a `{xref, type, gedcom, fullGedcom}` cursor and pass
// it through appendFactToRecord() for each follow-up link.
//
// Scope cut: CHIL/FAMS facts are always appended at the end of the
// family's own fact list, never inserted chronologically before a
// younger sibling/later marriage like real PHP's own
// childFactOfYoungerSibling()/famsFactOfLaterMarriage() helpers do -
// a display-ordering nicety (ReorderChildren/ReorderFamilies, the
// routes that let a user fix this manually, are themselves unported),
// not a functional requirement.

import { generateXref } from './tree-management.mjs';
import { updateChan, applyRecordUpdate, applyRecordDelete, allLinkedXrefs, getRecordByXref } from './record-merge.mjs';
import { createFactGedcom } from './fact-editor.mjs';
import { insertTypedRecord } from './gedcom-import.mjs';

/**
 * Mirrors Tree::createRecord()/createIndividual()/createFamily().
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {number} userId
 * @param {boolean} autoAcceptEdits
 * @param {string} author
 * @param {string} recordType 'INDI' or 'FAM'
 * @param {string} gedcomBody Everything after "0 @@ TYPE", e.g. "\n1 SEX M\n1 NAME ..."
 * @returns {Promise<{xref: string, type: string, gedcom: string, fullGedcom: string}>}
 *   `gedcom` is what's actually committed right now (real PHP's
 *   `$record->gedcom()` - '' unless auto-accepted); `fullGedcom` is
 *   the true current content, for building a follow-up append.
 */
export async function createRecordWithEmbeddedLink(client, gedcomId, userId, autoAcceptEdits, author, recordType, gedcomBody) {
  const xref = await generateXref(client);
  const builtGedcom = updateChan(`0 @${xref}@ ${recordType}${gedcomBody}`, author);

  const changeResult = await client.query(
    `INSERT INTO wt_change (gedcom_id, xref, old_gedcom, new_gedcom, status, user_id)
     VALUES ($1, $2, '', $3, 'pending', $4) RETURNING change_id`,
    [gedcomId, xref, builtGedcom, userId],
  );

  if (autoAcceptEdits) {
    await insertTypedRecord(client, gedcomId, xref, recordType, builtGedcom);
    await client.query("UPDATE wt_change SET status = 'accepted' WHERE change_id = $1", [changeResult.rows[0].change_id]);
  }

  return { xref, type: recordType, gedcom: autoAcceptEdits ? builtGedcom : '', fullGedcom: builtGedcom };
}

/**
 * Appends (or, with `before`, inserts before a matching existing
 * fact) one more fact line to a record this same request already
 * created or loaded, keeping its `{gedcom, fullGedcom}` cursor
 * correct for any FURTHER append in the same request - see file doc
 * comment.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {number} userId
 * @param {boolean} autoAcceptEdits
 * @param {string} author
 * @param {{xref: string, type: string, gedcom: string, fullGedcom: string}} current mutated in place
 * @param {string} factLine e.g. "1 FAMS @F1@"
 * @param {object} [options]
 * @param {boolean} [options.updateChan] Defaults to true, matching every real PHP call site here (`createFact($gedcom, true)`), except AddChildToFamilyAction/AddSpouseToFamilyAction's own family-facts append, which passes `false`.
 */
export async function appendFactToRecord(client, gedcomId, userId, autoAcceptEdits, author, current, factLine, { updateChan: shouldUpdateChan = true } = {}) {
  const newGedcomBody = createFactGedcom(current.fullGedcom, factLine);

  await applyRecordUpdate(
    client,
    gedcomId,
    userId,
    autoAcceptEdits,
    { xref: current.xref, type: current.type, gedcom: current.gedcom },
    newGedcomBody,
    { updateChan: shouldUpdateChan, author },
  );

  current.fullGedcom = newGedcomBody;
  current.gedcom = autoAcceptEdits ? newGedcomBody : '';
}

/**
 * Mirrors DeleteRecord's private removeLinks() (app/Http/RequestHandlers/
 * DeleteRecord.php) - strips every level-1..5 line linking to `xref`
 * (and that line's own children), across every level it can appear at.
 */
export function removeLinks(gedcom, xref) {
  let result = gedcom;
  for (let level = 1; level <= 5; level += 1) {
    result = result.replace(new RegExp(`\\n${level} [_A-Z][_A-Z0-9]* @${xref}@(?:\\n[${level + 1}-9].*)*`, 'g'), '');
  }
  return result;
}

/**
 * Mirrors DeleteRecord's handle() (app/Http/RequestHandlers/DeleteRecord.php) -
 * removes every link to `xref` from every record that links to it
 * (cascading a whole-family delete when removing the link leaves it
 * with only one member and no genealogy facts), then deletes `xref`
 * itself. Silently does nothing if the record can't be found - same
 * "no explicit error, just a 200" real PHP returns when its own
 * `Auth::isEditor && canShow && canEdit` guard fails (this port's
 * caller is expected to have already run the equivalent canEditRecord()
 * gate - see index.mjs's handleDeleteRecordAction()).
 *
 * @param {import('pg').PoolClient} client
 * @param {number} gedcomId
 * @param {number} userId
 * @param {boolean} autoAcceptEdits
 * @param {string} author
 * @param {{xref: string, type: string, gedcom: string}} record
 */
export async function deleteRecordCascade(client, gedcomId, userId, autoAcceptEdits, author, record) {
  const linkerXrefs = await allLinkedXrefs(client, gedcomId, record.xref);

  for (const linkerXref of linkerXrefs) {
    // eslint-disable-next-line no-await-in-loop
    const linker = await getRecordByXref(client, gedcomId, linkerXref);

    if (linker === null) {
      continue;
    }

    const newGedcom = removeLinks(linker.gedcom, record.xref);

    if (newGedcom === linker.gedcom) {
      continue;
    }

    const hasGenealogyFact = /\n1 (ANUL|CENS|DIV|DIVF|ENGA|MAR[BCLRS]|RESI|EVEN)/.test(newGedcom);
    const remainingLinks = [...newGedcom.matchAll(/\n1 (HUSB|WIFE|CHIL) @([A-Za-z0-9:_.-]{1,20})@/g)];

    if (linker.type === 'FAM' && !hasGenealogyFact && remainingLinks.length === 1) {
      // eslint-disable-next-line no-await-in-loop
      await applyRecordDelete(client, gedcomId, userId, autoAcceptEdits, linker);

      const relictXref = remainingLinks[0][2];
      // eslint-disable-next-line no-await-in-loop
      const relict = await getRecordByXref(client, gedcomId, relictXref);

      if (relict !== null && relict.type === 'INDI') {
        const relictGedcom = removeLinks(relict.gedcom, linker.xref);

        if (relictGedcom !== relict.gedcom) {
          // eslint-disable-next-line no-await-in-loop
          await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, relict, relictGedcom, { updateChan: false, author });
        }
      }
    } else {
      // eslint-disable-next-line no-await-in-loop
      await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, linker, newGedcom, { updateChan: false, author });
    }
  }

  await applyRecordDelete(client, gedcomId, userId, autoAcceptEdits, record);
}
