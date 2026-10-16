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
 *   Publication are NOT conditionally hidden via that same `data-columns`
 *   colvis config (confirmed: `null` there, unlike the four count columns
 *   below) - BUT real PHP does hide them statically below the `md`
 *   breakpoint via `class="d-none d-md-table-cell"` on both header and
 *   body cells (sources-table.phtml), ported here unconditionally (not
 *   behind a param) since it's a fixed CSS breakpoint, not a tree
 *   preference. Without it this table is permanently ~3 text columns
 *   wider than PHP's, which on common viewport widths pushed the
 *   Individuals/Families/Media objects columns off the right edge -
 *   found live via a user report that persisted even after wrapping the
 *   table in .table-responsive (which only turned "columns missing" into
 *   "columns require scrolling to reach", not a real fix).
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
        `<td class="d-none d-md-table-cell">${escapeHtml(source.abbreviation)}</td>`,
        `<td class="d-none d-md-table-cell">${escapeHtml(source.author)}</td>`,
        `<td class="d-none d-md-table-cell">${escapeHtml(source.publication)}</td>`,
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
    '<th class="d-none d-md-table-cell">Abbreviation</th>',
    '<th class="d-none d-md-table-cell">Author</th>',
    '<th class="d-none d-md-table-cell">Publication</th>',
    showIndividuals ? '<th>Individuals</th>' : null,
    showFamilies ? '<th>Families</th>' : null,
    showMedia ? '<th>Media objects</th>' : null,
    showNotes ? '<th>Shared notes</th>' : null,
    showLastChange ? '<th>Last change</th>' : null,
  ].filter((header) => header !== null);

  // Wrapped in .table-responsive (Bootstrap's overflow-x:auto) because
  // .wt-global (every page's own <body> class) sets overflow-x:hidden
  // with its own explicit design assumption that "any wide content will
  // have its own horizontal scrollbar" (resources/css/_base.css) - real
  // PHP's DataTables-powered table provides that itself; this plain
  // static table didn't, so with enough columns/data (confirmed live:
  // Individuals/Families/Media objects on a real tree) the right-most
  // columns were silently clipped off-screen - present in the raw HTML,
  // no console error, no second request, just invisible. Found via user
  // report ("columns aren't showing") + reading the raw HTML together.
  //
  // table-layout:fixed is ALSO required, not decorative - Bootstrap's own
  // .table sets width:100%, but with the default table-layout:auto that's
  // only a hint: a browser still widens the table past 100% to avoid
  // wrapping long cell text (this is exactly why Bootstrap ships
  // .table-responsive as a scroll fallback at all). Real PHP's DataTables
  // avoids this by computing fixed per-column pixel widths via JS, which
  // this plain table doesn't have - table-layout:fixed makes the browser
  // respect the 100% width and wrap text instead, which is what actually
  // stops columns from needing a horizontal scroll on a normal desktop
  // viewport (table-responsive alone was not sufficient - found live via
  // a user report that persisted after that fix: columns were reachable
  // by scrolling, which is not the same as visible without scrolling).
  const tableHtml =
    sources.length > 0
      ? `
    <div class="table-responsive">
    <table class="table table-bordered table-sm wt-table-source" style="table-layout: fixed; word-wrap: break-word;">
        <thead>
            <tr>
                ${headers.join('\n                ')}
            </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
    </table>
    </div>`
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
