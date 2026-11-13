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

// Views for /tree/{tree}/data-fix, /tree/{tree}/data-fix/{data_fix}
// (DataFixChoose/DataFixPage, phase 5 step 46) - mirrors
// resources/views/admin/data-fix-select.phtml and data-fix-page.phtml.
// The data-fix page's client-side search/update-all behaviour is
// genuinely custom JS in real PHP too (not the generic `datatables`
// auto-init webtrees.js already ships, unlike step 40's user list) -
// this is a direct translation of that inline script, with route()
// calls replaced by literal URLs built server-side.

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

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {Array<{name: string, title: string}>} params.dataFixes
 * @returns {string}
 */
export function renderDataFixChoosePage({ csrfToken, tree, dataFixes }) {
  const title = `Data fixes — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: 'Data fixes' }]);

  const options = dataFixes.map((module) => `<option value="${escapeHtml(module.name)}">${escapeHtml(module.title)}</option>`).join('');

  const bodyHtml = `
    <h1>${title}</h1>
    <form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/data-fix">
      <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="data_fix">Data fix</label>
        <div class="col-sm-9">
          <select class="form-select" id="data_fix" name="data_fix" required>
            <option value="">&lt;select&gt;</option>
            ${options}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" type="submit">next</button>
      ${csrfField(csrfToken)}
    </form>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {{name: string, title: string, description: string, optionsHtml: string}} params.dataFix
 * @returns {string}
 */
export function renderDataFixPage({ csrfToken, tree, dataFix }) {
  const title = `${escapeHtml(dataFix.title)} — ${escapeHtml(tree.title)}`;
  const breadcrumbsHtml = renderBreadcrumbs([
    CONTROL_PANEL_LINK,
    MANAGE_TREES_LINK(tree.gedcom_name),
    { label: 'Data fixes', url: `/tree/${encodeURIComponent(tree.gedcom_name)}/data-fix` },
    { label: dataFix.title },
  ]);

  const treePath = encodeURIComponent(tree.gedcom_name);
  const dataFixPath = encodeURIComponent(dataFix.name);
  const dataUrl = `/tree/${treePath}/data-fix/${dataFixPath}/data`;
  const updateAllUrl = `/tree/${treePath}/data-fix/${dataFixPath}/update-all`;

  const bodyHtml = `
    <h1>${title}</h1>
    <form action="#" id="data-fix-options">
      <p>${escapeHtml(dataFix.description)}</p>
      ${dataFix.optionsHtml}
      <div class="row mb-3">
        <div class="col-sm-3"></div>
        <div class="col-sm-9">
          <button class="btn btn-primary" type="button" id="btn-search">search</button>
          <button class="btn btn-primary" type="button" id="btn-update-all">update all</button>
        </div>
      </div>
    </form>

    <div id="data-fix-table-container" class="d-none">
      <table id="data-fix-table" class="table table-bordered table-sm table-hover">
        <thead>
          <tr><th class="w-75">Record</th><th class="w-25">Data fix</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <div id="data-fix-progress" class="d-none">
      <div class="progress" role="progressbar"><div class="progress-bar"></div></div>
    </div>

    <div id="data-fix-pager" class="d-none">
      <button type="button" class="btn btn-secondary" id="btn-prev-page">previous</button>
      <span id="data-fix-page-info"></span>
      <button type="button" class="btn btn-secondary" id="btn-next-page">next</button>
    </div>

    <script>
      (function () {
        let form = document.getElementById('data-fix-options');
        let container = document.getElementById('data-fix-table-container');
        let tbody = document.querySelector('#data-fix-table tbody');
        let progress = document.getElementById('data-fix-progress');
        let progressbar = progress.querySelector('.progress-bar');
        let pager = document.getElementById('data-fix-pager');
        let pageInfo = document.getElementById('data-fix-page-info');
        let pageSize = 20;
        let start = 0;
        let csrfToken = ${JSON.stringify(csrfToken)};

        function getParams() {
          let formData = new FormData(form);
          let params = new URLSearchParams();
          formData.forEach(function (value, key) { params.append(key, value); });
          return params;
        }

        function addParamsToUrl(u) {
          let url = new URL(u, window.location.origin);
          let formData = new FormData(form);
          formData.forEach(function (value, key) { url.searchParams.append(key, value); });
          return url.toString();
        }

        function renderPage() {
          let params = getParams();
          params.append('start', start);
          params.append('length', pageSize);
          params.append('_csrf', csrfToken);

          fetch(${JSON.stringify(dataUrl)}, { method: 'POST', body: params })
            .then(function (response) { return response.json(); })
            .then(function (result) {
              tbody.innerHTML = '';
              result.data.forEach(function (row) {
                let tr = document.createElement('tr');
                let td1 = document.createElement('td');
                td1.innerHTML = row[0];
                let td2 = document.createElement('td');
                td2.innerHTML = row[1];
                tr.appendChild(td1);
                tr.appendChild(td2);
                tbody.appendChild(tr);
              });
              pageInfo.textContent = 'Showing ' + (start + 1) + ' to ' + (start + result.data.length) + ' of ' + result.recordsTotal;
              container.classList.remove('d-none');
              pager.classList.remove('d-none');
            });
        }

        tbody.addEventListener('click', function (event) {
          if (event.target.dataset.updateUrl) {
            event.preventDefault();
            let body = new URLSearchParams();
            body.append('_csrf', csrfToken);
            fetch(event.target.dataset.updateUrl, { method: 'POST', body: body })
              .then(function () { renderPage(); });
          }
        });

        document.getElementById('btn-prev-page').addEventListener('click', function () {
          start = Math.max(0, start - pageSize);
          renderPage();
        });

        document.getElementById('btn-next-page').addEventListener('click', function () {
          start += pageSize;
          renderPage();
        });

        document.getElementById('btn-search').addEventListener('click', function (event) {
          event.preventDefault();
          start = 0;
          renderPage();
        });

        document.getElementById('btn-update-all').addEventListener('click', function (event) {
          event.preventDefault();
          progressbar.style.width = '0%';
          container.classList.add('d-none');
          pager.classList.add('d-none');
          progress.classList.remove('d-none');

          let url = addParamsToUrl(${JSON.stringify(updateAllUrl)});
          let csrfBody = new URLSearchParams();
          csrfBody.append('_csrf', csrfToken);
          fetch(url, { method: 'POST', body: csrfBody })
            .then(function (response) { return response.json(); })
            .then(function (updates) {
              let i = 0;
              function next() {
                if (i >= updates.length) { return; }
                let item = updates[i];
                fetch(item.url, { method: 'POST', body: csrfBody }).then(function () {
                  progressbar.style.width = item.percent;
                  i += 1;
                  next();
                });
              }
              next();
            });
        });
      })();
    </script>
  `;

  return renderAdminPage({ title, csrfToken, breadcrumbsHtml, bodyHtml });
}

/**
 * Standalone fragment for the preview "modal" (GET .../preview) - this
 * port renders it as a full small page rather than a true modal dialog
 * (same simplification already used for other AJAX-fragment endpoints
 * in this migration).
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.preview
 * @returns {string}
 */
export function renderDataFixPreviewFragment({ title, preview }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body>
<h3>${escapeHtml(title)}</h3>
${preview === '' ? '<p>This record does not need to be updated.</p>' : preview}
</body></html>`;
}
