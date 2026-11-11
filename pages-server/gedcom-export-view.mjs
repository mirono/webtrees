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

// View for /tree/{tree}/export (ExportGedcomPage) - mirrors
// resources/views/admin/trees-export.phtml + gedcom-export-options.phtml.
// Same conventions as tree-management-view.mjs: local escapeHtml(),
// renderAdminPage()/renderBreadcrumbs() shell, plain radio/select
// inputs (the real "extension" live-update-on-format-change script is
// reproduced as a tiny inline <script>, same "cosmetic JS only" cut as
// elsewhere).
//
// This route is AuthManager-gated (any tree manager, not just an
// admin) - see pages-server/index.mjs's authenticateTreeManager(). The
// real page's Member/Visitor privacy-radio branches
// (gedcom-export-options.phtml's `Auth::isMember()`/else branches) are
// therefore unreachable here and not ported - only the admin ('none'
// included) and manager (no 'none') cases apply.

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';

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

const ENCODING_OPTIONS = {
  'UTF-8': 'UTF-8',
  'UTF-16BE': 'UNICODE (UTF16-BE)',
  ANSEL: 'ANSEL',
  ASCII: 'ASCII',
  CP1252: 'ANSI (CP1252)',
};

const PRIVACY_LABELS = { none: 'None', gedadmin: 'Manager', user: 'Member', visitor: 'Visitor' };

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {string} params.filename
 * @param {Record<string,string>} params.downloadFilenames
 * @param {boolean} params.isAdmin whether to offer the 'none' (no
 *   privacy filtering) radio option - admin only, same as real PHP's
 *   `Auth::isAdmin()` check
 * @returns {string}
 */
export function renderExportGedcomPage({ csrfToken, tree, filename, downloadFilenames, isAdmin }) {
  const title = `Export a GEDCOM file — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: title }]);

  const privacyOptions = isAdmin ? ['none', 'gedadmin', 'user', 'visitor'] : ['gedadmin', 'user', 'visitor'];
  const defaultPrivacy = isAdmin ? 'none' : 'gedadmin';

  const privacyRadios = privacyOptions
    .map(
      (value) =>
        `<label class="me-3"><input type="radio" name="privacy" value="${value}" ${value === defaultPrivacy ? 'checked' : ''}> ${escapeHtml(PRIVACY_LABELS[value])}</label>`,
    )
    .join('');

  const encodingSelect = `<select class="form-select" name="encoding" id="encoding">${Object.entries(ENCODING_OPTIONS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === 'UTF-8' ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('')}</select>`;

  const filenameSelect = `<select class="form-select" name="filename" id="filename">${Object.keys(downloadFilenames)
    .map((value, index) => `<option value="${escapeHtml(value)}" ${index === 0 ? 'selected' : ''}>${escapeHtml(value)}</option>`)
    .join('')}</select>`;

  const bodyHtml = `
    <h1>${title}</h1>
    <div class="row">
      <div class="col-sm-6">
        <div class="card">
          <div class="card-header">A file on the server</div>
          <div class="card-body">
            <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/export-server" class="form form-horizontal">
              <div class="mb-3">
                <label for="server-filename">Filename</label>
                <input type="text" class="form-control" id="server-filename" name="filename" value="${escapeHtml(filename)}">
              </div>
              <button type="submit" class="btn btn-primary">save</button>
              ${csrfField(csrfToken)}
            </form>
          </div>
        </div>
      </div>
      <div class="col-sm-6">
        <div class="card">
          <div class="card-header">A file on your computer</div>
          <div class="card-body">
            <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/export-client" class="form form-horizontal">
              <p class="card-title">Export preferences</p>

              <div class="row mb-3">
                <label class="col-sm-3">Format</label>
                <div class="col-sm-9">
                  <div class="form-check"><input class="form-check-input" type="radio" name="format" id="format-gedcom" value="gedcom" data-wt-extension=".ged" checked> <label class="form-check-label" for="format-gedcom">GEDCOM</label></div>
                  <div class="form-check"><input class="form-check-input" type="radio" name="format" id="format-zip" value="zip" data-wt-extension=".zip"> <label class="form-check-label" for="format-zip">ZIP</label></div>
                  <div class="form-check"><input class="form-check-input" type="radio" name="format" id="format-zipmedia" value="zipmedia" data-wt-extension=".zip"> <label class="form-check-label" for="format-zipmedia">ZIP (includes media files)</label></div>
                  <div class="form-check"><input class="form-check-input" type="radio" name="format" id="format-gdz" value="gedzip" data-wt-extension=".gdz"> <label class="form-check-label" for="format-gdz">GEDZIP (includes media files)</label></div>
                </div>
              </div>

              <div class="row mb-3">
                <label class="col-sm-3" for="filename">Filename</label>
                <div class="col-sm-9">
                  <div class="input-group">
                    ${filenameSelect}
                    <span class="input-group-text" id="extension">.ged</span>
                  </div>
                </div>
              </div>

              <div class="row mb-3">
                <label class="col-sm-3" for="encoding">Character encoding</label>
                <div class="col-sm-9">${encodingSelect}</div>
              </div>

              <div class="row mb-3">
                <label class="col-sm-3">Line endings</label>
                <div class="col-sm-9">
                  <label class="me-3"><input type="radio" name="line_endings" value="CRLF" checked> CR/LF (windows)</label>
                  <label class="me-3"><input type="radio" name="line_endings" value="LF"> LF (unix)</label>
                </div>
              </div>

              <div class="row mb-3">
                <label class="col-sm-3">Apply privacy settings</label>
                <div class="col-sm-9">${privacyRadios}</div>
              </div>

              <button type="submit" class="btn btn-primary">download</button>
              ${csrfField(csrfToken)}
            </form>
          </div>
        </div>
      </div>
    </div>
    <script>
      document.querySelectorAll('[name=format]').forEach(el => el.addEventListener('change', e => document.getElementById('extension').innerText = e.target.dataset.wtExtension));
    </script>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}
