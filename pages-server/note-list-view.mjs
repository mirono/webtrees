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

// Hand-rolled HTML for /tree/{tree}/note-list (app/Module/NoteListModule.php)
// - the third "list" route this migration has ported, same shape as
// repository-list-view.mjs/source-list-view.mjs's own doc comments. Real
// PHP renders this via a DataTables-powered table
// (resources/views/lists/notes-table.phtml: client-side sort/search,
// conditional column visibility per linked-record type and the tree's
// SHOW_LAST_CHANGE preference) - deliberately simplified the same way: a
// plain, always-fully-visible server-rendered table, no sort/search
// interactivity, no conditional column hiding. See
// docs/php-to-js-migration/phase5-note-list.md.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors repository-list-view.mjs's own renderLastChange() exactly -
 * see that file's doc comment for the "Never" / plain-span simplification
 * reasoning, unchanged here.
 *
 * @param {{date: string, time: string}|null} lastChange
 */
function renderLastChange(lastChange) {
  if (lastChange === null) {
    return '<span class="wt-timestamp">Never</span>';
  }

  const timeHtml = lastChange.time ? ` – <span class="date">${escapeHtml(lastChange.time)}</span>` : '';

  return `<span class="date">${escapeHtml(lastChange.date)}</span>${timeHtml}`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {string} params.title
 * @param {{
 *   xref: string,
 *   url: string,
 *   fullNameHtml: string,
 *   individualCount: number,
 *   familyCount: number,
 *   mediaCount: number,
 *   sourceCount: number,
 *   lastChange: {date: string, time: string}|null,
 * }[]} params.notes `fullNameHtml` is PRE-ESCAPED SAFE HTML - inserted
 *   RAW, never passed through escapeHtml() again.
 */
export function renderNoteListPage({ tree, user, csrfToken, title, notes }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as repository-list-view.mjs. -->`
      : '';

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

  const rowsHtml = notes
    .map(
      (note) => `
        <tr>
            <td><a href="${escapeHtml(note.url)}">${note.fullNameHtml}</a></td>
            <td class="text-center">${note.individualCount}</td>
            <td class="text-center">${note.familyCount}</td>
            <td class="text-center">${note.mediaCount}</td>
            <td class="text-center">${note.sourceCount}</td>
            <td>${renderLastChange(note.lastChange)}</td>
        </tr>`,
    )
    .join('');

  const tableHtml =
    notes.length > 0
      ? `
    <table class="table table-bordered table-sm wt-table-note">
        <thead>
            <tr>
                <th>Title</th>
                <th>Individuals</th>
                <th>Families</th>
                <th>Media objects</th>
                <th>Sources</th>
                <th>Last change</th>
            </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
    </table>`
      : '';

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-note-list-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">${escapeHtml(title)}</h2>
                    <div class="wt-page-content">${tableHtml}</div>
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
