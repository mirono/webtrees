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

// Views for /tree/{tree}/merge-step1 and /tree/{tree}/merge-step2
// (MergeRecordsPage/MergeFactsPage, phase 5 step 45) - mirrors
// resources/views/admin/merge-records-step-1.phtml and
// merge-records-step-2.phtml. Same conventions as the GEDCOM
// import/export views: local escapeHtml(), renderAdminPage()/
// renderBreadcrumbs() shell.
//
// UI simplification (not a functional cut, see record-merge.mjs's top
// doc comment): real PHP's record pickers are live-search autocomplete
// widgets; this port uses plain `<select>` dropdowns listing every
// record of the chosen type instead.

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';
import { MERGEABLE_TYPES, MERGEABLE_TYPE_LABELS } from './record-merge.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function csrfField(csrfToken) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">`;
}

const CONTROL_PANEL_LINK = { label: 'Control panel', url: '/admin' };
const MANAGE_TREES_LINK = (treeName) => ({ label: 'Manage family trees', url: `/admin/trees/manage/${encodeURIComponent(treeName)}` });

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {string} params.type the currently-selected record type
 * @param {string} params.xref1
 * @param {string} params.xref2
 * @param {Array<{xref: string, label: string}>} params.records every record of `type`, for both pickers
 * @param {string|null} params.error
 * @returns {string}
 */
export function renderMergeStep1Page({ csrfToken, tree, type, xref1, xref2, records, error }) {
  const title = `Merge records — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const typeOptions = MERGEABLE_TYPES.map(
    (t) => `<option value="${t}" ${t === type ? 'selected' : ''}>${escapeHtml(MERGEABLE_TYPE_LABELS[t])}</option>`,
  ).join('');

  const recordOptions = (selected) =>
    records.length
      ? `<option value=""></option>${records
          .map((r) => `<option value="${escapeHtml(r.xref)}" ${r.xref === selected ? 'selected' : ''}>${escapeHtml(r.label)} — ${escapeHtml(r.xref)}</option>`)
          .join('')}`
      : '<option disabled selected>No records of this type.</option>';

  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const bodyHtml = `
    <h1>${title}</h1>
    ${errorHtml}
    <form method="get" action="/tree/${encodeURIComponent(tree.gedcom_name)}/merge-step1">
      <div class="row mb-3">
        <label class="col-sm-3 col-form-label">Select two records to merge</label>
        <div class="col-sm-9">
          <select class="form-select" name="type" onchange="this.form.submit()">${typeOptions}</select>
        </div>
      </div>
    </form>
    <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/merge-step1">
      <input type="hidden" name="type" value="${escapeHtml(type)}">
      <div class="row mb-3">
        <label class="col-sm-3 col-form-label">First record</label>
        <div class="col-sm-9">
          <select class="form-select" name="xref1" required>${recordOptions(xref1)}</select>
        </div>
      </div>
      <div class="row mb-3">
        <label class="col-sm-3 col-form-label">Second record</label>
        <div class="col-sm-9">
          <select class="form-select" name="xref2" required>${recordOptions(xref2)}</select>
        </div>
      </div>
      <button type="submit" class="btn btn-primary">continue</button>
      ${csrfField(csrfToken)}
    </form>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}

function renderFactRow({ id, gedcom }, checkboxName, checked) {
  const lines = gedcom
    .split('\n')
    .map((line) => escapeHtml(line))
    .join('<br>');

  return `<tr>
    <td><input type="checkbox" name="${checkboxName}" value="${escapeHtml(id)}" ${checked ? 'checked' : ''}></td>
    <td><code>${lines}</code></td>
  </tr>`;
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {string} params.xref1
 * @param {string} params.xref2
 * @param {{both: Array, only1: Array, only2: Array}} params.facts from compareFacts()
 * @param {string|null} params.error
 * @returns {string}
 */
export function renderMergeStep2Page({ csrfToken, tree, xref1, xref2, facts, error }) {
  const title = `Merge records — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const bothRows = facts.both.map((fact) => renderFactRow(fact, 'keep1[]', true)).join('');
  const only1Rows = facts.only1.map((fact) => renderFactRow(fact, 'keep1[]', true)).join('');
  const only2Rows = facts.only2.map((fact) => renderFactRow(fact, 'keep2[]', true)).join('');

  const bodyHtml = `
    <h1>${title}</h1>
    ${errorHtml}
    <p>Select the facts to keep. <strong>${escapeHtml(xref2)}</strong> will be deleted, and
    <strong>${escapeHtml(xref1)}</strong> will keep the facts selected below.</p>
    <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/merge-step2">
      <input type="hidden" name="xref1" value="${escapeHtml(xref1)}">
      <input type="hidden" name="xref2" value="${escapeHtml(xref2)}">

      <h2>Facts and events</h2>
      <table class="table"><tbody>${bothRows}</tbody></table>

      <h2>Facts only in ${escapeHtml(xref1)}</h2>
      <table class="table"><tbody>${only1Rows}</tbody></table>

      <h2>Facts only in ${escapeHtml(xref2)}</h2>
      <table class="table"><tbody>${only2Rows}</tbody></table>

      <button type="submit" class="btn btn-primary">merge</button>
      ${csrfField(csrfToken)}
    </form>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {boolean} params.success
 * @param {boolean} params.pending whether the merge is still awaiting moderation (auto_accept_edits was off)
 * @param {string|null} params.error
 * @returns {string}
 */
export function renderMergeResultPage({ csrfToken, tree, success, pending, error }) {
  const title = `Merge records — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const bodyHtml = success
    ? `<h1>${title}</h1>
       <div class="alert alert-success">
         ${pending ? 'The records have been merged. The changes have been recorded as pending changes, awaiting moderation.' : 'The records have been merged.'}
       </div>
       <a class="btn btn-primary" href="/admin/trees/manage/${encodeURIComponent(tree.gedcom_name)}">continue</a>`
    : `<h1>${title}</h1>
       <div class="alert alert-danger">${error ? escapeHtml(error) : 'The records could not be merged.'}</div>
       <a class="btn btn-primary" href="/tree/${encodeURIComponent(tree.gedcom_name)}/merge-step1">back</a>`;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}
