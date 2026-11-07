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

// The shared admin page shell - mirrors layouts/administration.phtml,
// same as control-panel-view.mjs's own inline copy (step 39), but
// factored out here since every FURTHER admin page (step 40's user
// management, and any admin page ported after it) reuses the exact
// same shell + breadcrumb bar (components/breadcrumbs.phtml).
// control-panel-view.mjs's own copy is left as-is (not worth the
// churn of switching an already-shipped, already-tested page over to
// this shared version for no behavior change).

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors components/breadcrumbs.phtml.
 *
 * @param {Array<{label: string, url?: string}>} links the last entry should have no `url` (the active/current page)
 * @returns {string}
 */
export function renderBreadcrumbs(links) {
  const items = links
    .map(({ label, url }) =>
      url !== undefined
        ? `<li class="breadcrumb-item"><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></li>`
        : `<li class="breadcrumb-item active">${escapeHtml(label)}</li>`,
    )
    .join('\n');

  return `<nav class="wt-breadcrumbs" aria-label="breadcrumb" role="navigation">
    <ol class="breadcrumb small py-2">${items}</ol>
</nav>`;
}

/**
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.csrfToken
 * @param {string} [params.breadcrumbsHtml]
 * @param {string} params.bodyHtml
 * @returns {string}
 */
export function renderAdminPage({ title, csrfToken, breadcrumbsHtml = '', bodyHtml }) {
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/administration.min.css">
</head>
<body class="container-lg wt-global wt-control-panel">
    <header>
        <ul class="nav small d-flex justify-content-end">
            <li class="nav-item menu-mypage"><a class="nav-link active" href="/">My page</a></li>
            <li class="nav-item menu-logout">
                <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
            </li>
        </ul>
    </header>
    <main id="content">
        ${breadcrumbsHtml}
        ${bodyHtml}
    </main>
    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
