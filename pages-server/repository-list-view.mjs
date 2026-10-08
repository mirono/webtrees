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

// Hand-rolled HTML for /tree/{tree}/repository-list
// (app/Module/RepositoryListModule.php) - the first "list" route this
// migration has ported (every prior phase-5 route was a single-record
// page). Real PHP renders this via a DataTables-powered table
// (resources/views/lists/repositories-table.phtml: client-side sort/
// search, conditional column visibility based on whether ANY repository
// has linked sources and on the tree's SHOW_LAST_CHANGE preference) -
// deliberately simplified to a plain, always-fully-visible server-
// rendered table: no sort/search interactivity, no conditional column
// hiding. See docs/php-to-js-migration/phase5-repository-list.md.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors components/datetime.phtml's "Never" case for a record with no
 * CHAN fact; otherwise reuses the same `<span class="date">` shape
 * every other route's own CHAN rendering already uses, rather than
 * porting `isoFormat('LLLL')`'s full weekday/month-name format or the
 * "time ago" tooltip - a plainer, but still accurate, date/time.
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
 *   sourceCount: number,
 *   lastChange: {date: string, time: string}|null,
 * }[]} params.repositories `fullNameHtml` is PRE-ESCAPED SAFE HTML -
 *   inserted RAW, never passed through escapeHtml() again.
 * @param {boolean} params.showLastChange mirrors real PHP's own
 *   `(bool) $tree->getPreference('SHOW_LAST_CHANGE')` column-visibility
 *   check (repositories-table.phtml's own `data-columns` config) - the
 *   caller resolves this from the tree's own preference
 *   (source.mjs's loadShowLastChangePref()), not derived from the rows
 *   themselves like the "Sources" column below.
 */
export function renderRepositoryListPage({ tree, user, csrfToken, title, repositories, showLastChange }) {
  // Mirrors repositories-table.phtml's own `array_sum($count_sources) > 0`
  // check - unlike showLastChange above, this is derived from the rows
  // themselves (every repository already carries its own resolved
  // sourceCount), not a separate tree-level preference.
  const showSources = repositories.some((repository) => repository.sourceCount > 0);
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as repository-view.mjs. -->`
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

  const rowsHtml = repositories
    .map(
      (repository) => `
        <tr>
            <td><a href="${escapeHtml(repository.url)}">${repository.fullNameHtml}</a></td>${
        showSources ? `\n            <td class="text-center">${repository.sourceCount}</td>` : ''
      }${showLastChange ? `\n            <td>${renderLastChange(repository.lastChange)}</td>` : ''}
        </tr>`,
    )
    .join('');

  const tableHtml =
    repositories.length > 0
      ? `
    <table class="table table-bordered table-sm wt-table-repository">
        <thead>
            <tr>
                <th>Repository name</th>${showSources ? '\n                <th>Sources</th>' : ''}${
        showLastChange ? '\n                <th>Last change</th>' : ''
      }
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
<body class="wt-global wt-theme-webtrees wt-route-repository-list-page">
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
