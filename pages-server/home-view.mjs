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

// HomePage.php is almost entirely a redirect dispatcher (see
// docs/php-to-js-migration/phase5-home-page.md) - this is its one real
// render case: a logged-in user with no access to any tree
// (resources/views/errors/no-tree-access.phtml). Only reachable when
// logged in, so includes the same header/Sign-out chrome as
// account-view.mjs (and needs the same <meta name="csrf"> tag for the
// same reason - see account-view.mjs's own comment on this).

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {object} params
 * @param {{realName: string}} params.user
 * @param {string} params.csrfToken
 */
export function renderNoTreeAccessPage({ user, csrfToken }) {
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>webtrees</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-home">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">
                        <li class="nav-item">
                            <span class="nav-link">${escapeHtml(user.realName)}</span>
                        </li>
                        <li class="nav-item menu-logout">
                            <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="alert alert-danger">This user account does not have access to any tree.</div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
