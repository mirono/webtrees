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

// View for /tree/{tree}/import (ImportGedcomPage) - mirrors
// resources/views/admin/trees-import.phtml. Same conventions as
// gedcom-export-view.mjs: local escapeHtml(), renderAdminPage()/
// renderBreadcrumbs() shell.
//
// Real PHP always shows a permanent "this will delete all genealogy
// data" banner, and only JS-confirms if the chosen filename differs
// from the tree's last-imported one. This port instead gates the
// submit button on an explicit checkbox whenever the tree already has
// data (not merely a different filename) - the user's own choice for
// this step's import semantics (warn, then require confirmation,
// rather than only warning about a filename change). The real
// server-side handler re-checks this independently of the client-side
// checkbox - see index.mjs's handleImportGedcomPage().

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';
import { ENCODING_SELECT_OPTIONS } from './gedcom-import.mjs';

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

const ENCODING_LABELS = {
  '': 'automatic',
  'UTF-8': 'UTF-8',
  'UTF-16BE': 'UNICODE (UTF16-BE)',
  ANSEL: 'ANSEL',
  ASCII: 'ASCII',
  CP1252: 'ANSI (CP1252)',
};

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {string} params.dataFolder
 * @param {string} params.defaultGedcomFile
 * @param {string[]} params.serverFiles
 * @param {string} params.gedcomMediaPath
 * @param {boolean} params.keepMedia
 * @param {boolean} params.wordWrappedNotes
 * @param {boolean} params.hasExistingData whether to require the
 *   destructive-replace confirmation checkbox
 * @param {string|null} params.error
 * @returns {string}
 */
export function renderImportGedcomPage({
  csrfToken,
  tree,
  dataFolder,
  defaultGedcomFile,
  serverFiles,
  gedcomMediaPath,
  keepMedia,
  wordWrappedNotes,
  hasExistingData,
  error,
}) {
  const title = `Import a GEDCOM file — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const serverOptions = serverFiles.length
    ? serverFiles
        .map((file) => `<option value="${escapeHtml(file)}" ${file === defaultGedcomFile ? 'selected' : ''}>${escapeHtml(file)}</option>`)
        .join('')
    : '<option disabled selected>No GEDCOM files found.</option>';

  const encodingSelect = `<select class="form-select" name="encoding">${Object.entries(ENCODING_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('')}</select>`;

  const errorHtml = error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : '';

  const confirmHtml = hasExistingData
    ? `<div class="alert alert-warning">
         <strong>This tree already contains genealogy data.</strong> Importing will permanently delete
         all of “${escapeHtml(tree.title)}”'s existing individuals, families, sources, and other records
         (media objects are kept if you check "Keep media objects" below) and replace them with the
         contents of the selected GEDCOM file. This cannot be undone.
       </div>
       <div class="form-check mb-3">
         <input type="checkbox" class="form-check-input" id="confirm-replace" onchange="document.getElementById('import-submit').disabled = !this.checked">
         <label class="form-check-label" for="confirm-replace">I understand this will delete the existing data in this tree.</label>
       </div>
       <input type="hidden" name="confirmed" value="1">`
    : '';

  const bodyHtml = `
    <h1>${title}</h1>
    ${errorHtml}
    <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/import" enctype="multipart/form-data">
      <h2>Select a GEDCOM file to import</h2>

      <div class="row mb-3">
        <label class="col-form-label col-sm-4">
          <input type="radio" name="source" value="client" checked> A file on your computer
        </label>
        <div class="col-sm-8">
          <input type="file" name="client_file" class="form-control">
        </div>
      </div>

      <div class="row mb-3">
        <label class="col-form-label col-sm-4">
          <input type="radio" name="source" value="server"> A file on the server
        </label>
        <div class="col-sm-8">
          <div class="input-group">
            <span class="input-group-text">${escapeHtml(dataFolder)}</span>
            <select name="server_file" class="form-select">
              <option selected value=""></option>
              ${serverOptions}
            </select>
          </div>
        </div>
      </div>

      <hr>
      <h2>Import preferences</h2>

      <div class="row mb-3">
        <label class="col-sm-3">Character encoding</label>
        <div class="col-sm-9">${encodingSelect}</div>
      </div>

      <div class="row mb-3">
        <div class="col-sm-3">Keep media objects</div>
        <div class="col-sm-9">
          <div class="form-check">
            <input type="checkbox" class="form-check-input" name="keep_media" id="keep_media" value="1" ${keepMedia ? 'checked' : ''}>
            <label for="keep_media" class="form-check-label">If you have created media objects in webtrees, and have subsequently edited this GEDCOM file using software that deletes media objects, select this to merge the current media objects with the new file.</label>
          </div>
        </div>
      </div>

      <div class="row mb-3">
        <div class="col-sm-3">Add spaces where long lines were wrapped</div>
        <div class="col-sm-9">
          <div class="form-check">
            <input type="checkbox" class="form-check-input" name="WORD_WRAPPED_NOTES" id="WORD_WRAPPED_NOTES" value="1" ${wordWrappedNotes ? 'checked' : ''}>
            <label for="WORD_WRAPPED_NOTES" class="form-check-label">If you created this GEDCOM file using software that omits spaces when splitting long lines, select this to reinsert the missing spaces.</label>
          </div>
        </div>
      </div>

      <div class="row mb-3">
        <label class="col-sm-3" for="GEDCOM_MEDIA_PATH">Remove the GEDCOM media path from filenames</label>
        <div class="col-sm-9">
          <input class="form-control" id="GEDCOM_MEDIA_PATH" maxlength="255" name="GEDCOM_MEDIA_PATH" type="text" value="${escapeHtml(gedcomMediaPath)}">
        </div>
      </div>

      <hr>
      ${confirmHtml}
      <button type="submit" id="import-submit" class="btn btn-primary" ${hasExistingData ? 'disabled' : ''}>continue</button>
      ${csrfField(csrfToken)}
    </form>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}

/**
 * Result page shown after a synchronous import attempt (success or
 * failure) - this port's "one synchronous request" architecture means
 * there's no AJAX-polled progress page to mirror.
 *
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {boolean} params.success
 * @param {number} params.recordCount
 * @param {string|null} params.error
 * @returns {string}
 */
export function renderImportResultPage({ csrfToken, tree, success, recordCount, error }) {
  const title = `Import a GEDCOM file — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const bodyHtml = success
    ? `<h1>${title}</h1>
       <div class="alert alert-success">The GEDCOM file was imported successfully (${recordCount} records).</div>
       <a class="btn btn-primary" href="/admin/trees/manage/${encodeURIComponent(tree.gedcom_name)}">continue</a>`
    : `<h1>${title}</h1>
       <div class="alert alert-danger">The GEDCOM file could not be imported.${error ? ` ${escapeHtml(error)}` : ''}</div>
       <a class="btn btn-primary" href="/tree/${encodeURIComponent(tree.gedcom_name)}/import">back</a>`;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}
