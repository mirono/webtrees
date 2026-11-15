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

// Small shared HTML fragments that wire a display page's own fact rows
// up to editing Phase B's routes (phase 5 step 49 - adding edit entry
// points to already-ported display pages, specifically so the user
// can manually exercise everything Phase A/B built through a browser
// rather than only curl). Mirrors resources/views/fact-edit-links.phtml
// (the per-fact edit/copy/delete icon trio, edit/icon-fact-*.phtml)
// and resources/views/edit/add-fact-row.phtml (the "Add a fact"
// dropdown), both normally included on every record page's facts
// table.
//
// Scope cut: real add-fact-row.phtml also renders a `$quick_facts` row
// of one-click shortcut links, built from the tree's own
// INDI_FACTS_QUICK/FAM_FACTS_QUICK preference plus a hardcoded
// "$unique_facts" per-type exclusion list - omitted here; the
// dropdown-and-redirect flow (reusing SelectNewFact, already built)
// reaches every available fact type just as well, just with one more
// click. Paste is also omitted from the per-fact row (real PHP doesn't
// put it there either - pastableFactsOfType() only ever drives a
// separate "paste a fact of a given type" affordance this migration
// hasn't built a UI for yet; PasteFact itself is already fully wired
// and reachable directly, e.g. via curl, for continued testing).

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors fact-edit-links.phtml - the edit/copy/delete icon trio shown
 * under one fact's own row. Caller is expected to only call this when
 * the fact is actually editable (`fact.canEdit`, from
 * extractVisibleFacts()'s editContext parameter).
 *
 * @param {object} params
 * @param {string} params.treeName
 * @param {string} params.recordType e.g. 'INDI', 'FAM' - the OWNING record's type (a family fact shown on an individual's own page still edits the family, not the individual).
 * @param {string} params.recordXref The owning record's own xref.
 * @param {string} params.factId
 * @param {string} [params.returnUrl] Where "cancel"/save should return to - defaults to the owning record's own page.
 */
export function renderFactEditLinks({ treeName, recordType, recordXref, factId: id, returnUrl }) {
  const base = `/tree/${encodeURIComponent(treeName)}`;
  const urlParam = returnUrl ? `?url=${encodeURIComponent(returnUrl)}` : '';
  const editUrl = `${base}/edit-fact/${encodeURIComponent(recordXref)}/${encodeURIComponent(id)}${urlParam}`;
  const copyUrl = `${base}/copy/${encodeURIComponent(recordXref)}/${encodeURIComponent(id)}`;
  const deleteUrl = `${base}/delete/${encodeURIComponent(recordXref)}/${encodeURIComponent(id)}`;

  return (
    `<div class="pt-2 wt-fact-edit-links">` +
    `<a class="btn btn-link btn-sm" href="${escapeHtml(editUrl)}" title="Edit"><span class="wt-icon-edit"><i class="fa-solid fa-pencil-alt"></i></span><span class="visually-hidden">Edit</span></a>` +
    `<a class="btn btn-link btn-sm" href="#" data-wt-post-url="${escapeHtml(copyUrl)}" title="Copy"><span class="wt-icon-copy"><i class="fa-solid fa-copy"></i></span><span class="visually-hidden">Copy</span></a>` +
    `<a class="btn btn-link btn-sm" href="#" data-wt-confirm="Are you sure you want to delete this fact?" data-wt-post-url="${escapeHtml(deleteUrl)}" title="Delete"><span class="wt-icon-delete"><i class="fa-solid fa-trash-alt"></i></span><span class="visually-hidden">Delete</span></a>` +
    `</div>`
  );
}

/**
 * Mirrors edit/add-fact-row.phtml's dropdown-and-submit form (minus
 * the quick-facts shortcut row - see file doc comment), as one
 * `<tr>` to append to a facts table.
 *
 * @param {object} params
 * @param {string} params.treeName
 * @param {string} params.recordXref
 * @param {Array<{tag: string, label: string}>} params.addFacts Already sorted by label.
 */
export function renderAddFactRow({ treeName, recordXref, addFacts }) {
  if (addFacts.length === 0) {
    return '';
  }

  const options = addFacts.map((f) => `<option value="${escapeHtml(f.tag)}">${escapeHtml(f.label)}</option>`).join('');
  const actionUrl = `/tree/${encodeURIComponent(treeName)}/add-fact/${encodeURIComponent(recordXref)}`;

  return (
    `<tr><th scope="row"><label for="add-fact">Add a fact</label></th><td>` +
    `<form method="post" action="${escapeHtml(actionUrl)}">` +
    `<div class="input-group"><select class="form-select" id="add-fact" name="fact"><option value="" disabled selected>&lt;select&gt;</option>${options}</select>` +
    `<button class="btn btn-primary" type="submit">add</button></div>` +
    `</form></td></tr>`
  );
}

/**
 * A page-level "Edit record" link, next to the facts-table heading -
 * real PHP reaches EditRecordPage only via individual-page-menu's
 * "Edit" dropdown item, which this port doesn't have; a plain link is
 * the minimal equivalent for manual testing.
 */
export function renderEditRecordLink({ treeName, recordXref }) {
  const url = `/tree/${encodeURIComponent(treeName)}/edit-record/${encodeURIComponent(recordXref)}`;
  return `<a class="btn btn-link" href="${escapeHtml(url)}">Edit record</a>`;
}
