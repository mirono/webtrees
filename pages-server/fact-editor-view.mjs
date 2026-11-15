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

// Views for editing Phase B (phase 5 step 48) - mirrors
// resources/views/edit/edit-fact.phtml, edit-record.phtml,
// raw-gedcom-fact.phtml, raw-gedcom-record.phtml. These are ordinary
// front-end tree pages (AuthEditor, not an admin page), so - like
// every other already-ported tree page (e.g. family-list-view.mjs) -
// they use the standard front-end page shell (genealogy menu, user
// menu), not admin-layout-view.mjs's administration shell.
//
// UI simplifications (not functional cuts): no on-screen keyboard
// modal, no calendar-popup JS yet (see gedcom-edit-widgets.mjs's own
// doc comment), and the raw-GEDCOM textareas don't live-validate
// against Gedcom::REGEX_FACT while typing (`data-wt-pattern` +
// `webtrees.textareaPatterns()` is real PHP's own client-side nicety;
// the server still validates on submit).

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

function renderPageShell({ tree, user, csrfToken, genealogyMenuHtml = '', title, bodyHtml }) {
  const csrfMetaTag = user !== null ? `\n    <meta name="csrf" content="${escapeHtml(csrfToken)}">` : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item">
                        <span class="nav-link">${escapeHtml(user.realName)}</span>
                    </li>
                    <li class="nav-item menu-logout">
                        <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                    </li>`
      : `
                    <li class="nav-item">
                        <a class="nav-link" href="/login">Sign in</a>
                    </li>`;

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title.replace(/<[^>]+>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    ${bodyHtml}
                </div>
            </div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}

/**
 * Mirrors edit/edit-fact.phtml - shared by AddNewFact and EditFactPage.
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.actionUrl EditFactAction's URL
 * @param {string} params.fieldsHtml Already-rendered gedcom-edit-widgets.mjs output.
 * @param {string} params.url Where "cancel"/successful save return to.
 * @param {boolean} params.keepChanChecked
 * @param {string} params.hiddenUrl '' if there's nothing extra to reveal, else a link back to this same page with include_hidden=true.
 * @param {boolean} params.canEditRaw
 * @param {string} [params.rawEditUrl]
 */
export function renderEditFactPage({
  tree,
  user,
  csrfToken,
  genealogyMenuHtml = '',
  title,
  actionUrl,
  fieldsHtml,
  url,
  keepChanChecked,
  hiddenUrl,
  canEditRaw,
  rawEditUrl = '',
}) {
  const hiddenLinkHtml = hiddenUrl !== '' ? `<a class="btn btn-link" href="${escapeHtml(hiddenUrl)}">Edit with all GEDCOM tags</a>` : '';
  const rawLinkHtml = canEditRaw ? `<a class="btn btn-link" href="${escapeHtml(rawEditUrl)}">Edit the raw GEDCOM</a>` : '';

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" action="${escapeHtml(actionUrl)}" class="wt-page-content">
        <input type="hidden" name="url" value="${escapeHtml(url)}">
        ${fieldsHtml}
        <div class="row mb-3">
            <div class="col-sm-3 wt-page-options-label"></div>
            <div class="col-sm-9 wt-page-options-value">
                <div class="mb-3">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" name="keep_chan" id="keep_chan" value="1" ${keepChanChecked ? 'checked="checked"' : ''}>
                        <label class="form-check-label" for="keep_chan">Keep the existing "last change" information</label>
                    </div>
                </div>
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(url)}">cancel</a>
                ${hiddenLinkHtml}
                ${rawLinkHtml}
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}

/**
 * Mirrors edit/edit-record.phtml (EditRecordPage).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.actionUrl EditRecordAction's URL
 * @param {string} params.fieldsHtml
 * @param {string} params.cancelUrl record.url()
 * @param {boolean} params.hasChan
 * @param {boolean} params.keepChanChecked
 * @param {string} params.hiddenUrl
 * @param {boolean} params.canEditRaw
 * @param {string} [params.rawEditUrl]
 */
export function renderEditRecordPage({
  tree,
  user,
  csrfToken,
  genealogyMenuHtml = '',
  title,
  actionUrl,
  fieldsHtml,
  cancelUrl,
  hasChan,
  keepChanChecked,
  hiddenUrl,
  canEditRaw,
  rawEditUrl = '',
}) {
  const keepChanHtml = hasChan
    ? `
                <div class="mb-3">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" name="keep_chan" id="keep_chan" value="1" ${keepChanChecked ? 'checked="checked"' : ''}>
                        <label class="form-check-label" for="keep_chan">Keep the existing "last change" information</label>
                    </div>
                </div>`
    : '';

  const hiddenLinkHtml = hiddenUrl !== '' ? `<a class="btn btn-link" href="${escapeHtml(hiddenUrl)}">Edit with all GEDCOM tags</a>` : '';
  const rawLinkHtml = canEditRaw ? `<a class="btn btn-link" href="${escapeHtml(rawEditUrl)}">Edit the raw GEDCOM</a>` : '';

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" action="${escapeHtml(actionUrl)}" class="wt-page-content">
        ${fieldsHtml}
        <div class="row mb-3">
            <div class="col-sm-3 wt-page-options-label"></div>
            <div class="col-sm-9 wt-page-options-value">${keepChanHtml}
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(cancelUrl)}">cancel</a>
                ${hiddenLinkHtml}
                ${rawLinkHtml}
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}

/**
 * Mirrors edit/raw-gedcom-fact.phtml (EditRawFactPage).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.actionUrl EditRawFactAction's URL
 * @param {string} params.url
 * @param {string} params.summary Card header label (fact-editor.mjs's factSummaryLabel()).
 * @param {string} params.gedcom
 * @param {string} params.cancelUrl
 */
export function renderRawGedcomFactPage({ tree, user, csrfToken, genealogyMenuHtml = '', title, actionUrl, url, summary, gedcom, cancelUrl }) {
  const rows = 5 + (gedcom.match(/\n/g) ?? []).length;

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" id="edit-raw-gedcom" action="${escapeHtml(actionUrl)}" class="wt-page-content">
        <input type="hidden" name="url" value="${escapeHtml(url)}">
        <div class="form-text">This page allows you to bypass the usual forms, and edit the underlying data directly. It is an advanced option, and you should not use it unless you understand the GEDCOM format. If you make a mistake here, it can be difficult to fix.</div>
        <div class="card my-2">
            <label class="card-header py-1 px-2 d-flex" for="gedcom">${escapeHtml(summary)}</label>
            <textarea class="card-body form-control py-1 px-2" id="gedcom" name="gedcom" rows="${rows}" dir="ltr">${escapeHtml(gedcom)}</textarea>
        </div>
        <div class="row mb-3">
            <div class="col-sm-9 offset-sm-3">
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(cancelUrl)}">cancel</a>
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}

/**
 * Mirrors edit/raw-gedcom-record.phtml (EditRawRecordPage).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.actionUrl EditRawRecordAction's URL
 * @param {string} params.level0
 * @param {Array<{id: string, tag: string, summary: string, gedcom: string}>} params.facts
 * @param {string} params.cancelUrl
 */
export function renderRawGedcomRecordPage({ tree, user, csrfToken, genealogyMenuHtml = '', title, actionUrl, level0, facts, cancelUrl }) {
  const factsHtml = facts
    .map((fact) => {
      const rows = 1 + (fact.gedcom.match(/\n/g) ?? []).length;
      const warningHtml =
        fact.tag === 'FILE'
          ? `<div class="alert alert-warning mb-0">If you modify the filename, you should also rename the file.</div>`
          : '';

      return `
            <div class="card my-2 wt-sortable-item">
                <input type="hidden" name="fact_id[]" value="${escapeHtml(fact.id)}">
                <div class="card-header">${escapeHtml(fact.summary)}</div>
                <label class="visually-hidden" for="fact-${escapeHtml(fact.id)}">${escapeHtml(fact.summary)}</label>
                ${warningHtml}
                <textarea class="card-body form-control py-1 px-2" dir="ltr" id="fact-${escapeHtml(fact.id)}" name="fact[]" rows="${rows}">${escapeHtml(fact.gedcom)}</textarea>
            </div>`;
    })
    .join('');

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" id="edit-raw-gedcom" action="${escapeHtml(actionUrl)}" class="wt-page-content">
        <div class="form-text">This page allows you to bypass the usual forms, and edit the underlying data directly. It is an advanced option, and you should not use it unless you understand the GEDCOM format. If you make a mistake here, it can be difficult to fix.</div>
        <div class="card">
            <label class="card-header py-1 px-2" for="level0">${title}</label>
            <textarea class="card-body form-control py-1 px-2" id="level0" name="level0" rows="1" dir="ltr" readonly>${escapeHtml(level0)}</textarea>
        </div>
        <div class="wt-sortable-list">${factsHtml}
            <div class="card my-2">
                <label class="card-header py-1 px-2" for="fact-add">Add a fact</label>
                <input type="hidden" name="fact_id[]" value="">
                <textarea class="card-body form-control py-1 px-2" dir="ltr" id="fact-add" name="fact[]" rows="5"></textarea>
            </div>
        </div>
        <div class="row mb-3">
            <div class="col-sm-9 offset-sm-3">
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(cancelUrl)}">cancel</a>
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}
