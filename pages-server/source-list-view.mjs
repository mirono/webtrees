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

// Hand-rolled HTML for /tree/{tree}/source-list (app/Module/SourceListModule.php)
// - the second "list" route this migration has ported, same shape as
// repository-list-view.mjs's own doc comment. Real PHP renders this via
// a DataTables-powered table (resources/views/lists/sources-table.phtml:
// client-side sort/search, conditional column visibility per linked-record
// type and the tree's SHOW_LAST_CHANGE preference) - deliberately
// simplified the same way: a plain, always-fully-visible server-rendered
// table, no sort/search interactivity, no conditional column hiding. See
// docs/php-to-js-migration/phase5-source-list.md.

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
 *   abbreviation: string,
 *   author: string,
 *   publication: string,
 *   individualCount: number,
 *   familyCount: number,
 *   mediaCount: number,
 *   noteCount: number,
 *   lastChange: {date: string, time: string}|null,
 * }[]} params.sources `fullNameHtml` is PRE-ESCAPED SAFE HTML - inserted
 *   RAW, never passed through escapeHtml() again; every other field is
 *   plain text, escaped here.
 * @param {boolean} params.showLastChange mirrors real PHP's own
 *   `(bool) $tree->getPreference('SHOW_LAST_CHANGE')` column-visibility
 *   check (sources-table.phtml's own `data-columns` config) - resolved
 *   by the caller from the tree's own preference
 *   (source.mjs's loadShowLastChangePref()). Abbreviation/Author/
 *   Publication are NOT conditionally hidden in real PHP (confirmed:
 *   `null` in that same `data-columns` array, unlike the four count
 *   columns below) - always shown here too.
 */
export function renderSourceListPage({ tree, user, csrfToken, title, sources, showLastChange }) {
  // Mirrors sources-table.phtml's own `array_sum($count_xxx) > 0` checks
  // - each derived from the rows themselves (every source already
  // carries its own resolved counts), not a separate tree preference
  // like showLastChange above.
  const showIndividuals = sources.some((source) => source.individualCount > 0);
  const showFamilies = sources.some((source) => source.familyCount > 0);
  const showMedia = sources.some((source) => source.mediaCount > 0);
  const showNotes = sources.some((source) => source.noteCount > 0);
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

  const rowsHtml = sources
    .map((source) => {
      const cells = [
        `<td><a href="${escapeHtml(source.url)}">${source.fullNameHtml}</a></td>`,
        `<td>${escapeHtml(source.abbreviation)}</td>`,
        `<td>${escapeHtml(source.author)}</td>`,
        `<td>${escapeHtml(source.publication)}</td>`,
        showIndividuals ? `<td class="text-center">${source.individualCount}</td>` : null,
        showFamilies ? `<td class="text-center">${source.familyCount}</td>` : null,
        showMedia ? `<td class="text-center">${source.mediaCount}</td>` : null,
        showNotes ? `<td class="text-center">${source.noteCount}</td>` : null,
        showLastChange ? `<td>${renderLastChange(source.lastChange)}</td>` : null,
      ].filter((cell) => cell !== null);

      return `
        <tr>
            ${cells.join('\n            ')}
        </tr>`;
    })
    .join('');

  const headers = [
    '<th>Title</th>',
    '<th>Abbreviation</th>',
    '<th>Author</th>',
    '<th>Publication</th>',
    showIndividuals ? '<th>Individuals</th>' : null,
    showFamilies ? '<th>Families</th>' : null,
    showMedia ? '<th>Media objects</th>' : null,
    showNotes ? '<th>Shared notes</th>' : null,
    showLastChange ? '<th>Last change</th>' : null,
  ].filter((header) => header !== null);

  const tableHtml =
    sources.length > 0
      ? `
    <table class="table table-bordered table-sm wt-table-source">
        <thead>
            <tr>
                ${headers.join('\n                ')}
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
<body class="wt-global wt-theme-webtrees wt-route-source-list-page">
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
