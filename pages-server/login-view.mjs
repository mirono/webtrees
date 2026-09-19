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

// Hand-rolled HTML for /login - a deliberately scoped-down replica of
// resources/views/login-page.phtml, same "no-tree variant only, prove
// the pattern" scope as account-view.mjs (no per-tree welcome text, no
// default-tree redirect). "Forgot password?"/"Request a new user
// account" link to the still-PHP-served /password-request and
// /register routes directly - plain hrefs, the proxy forwards them
// normally since they don't match a Node route prefix.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * A simpler, sufficient stand-in for PHP's Validator::isLocalUrl()
 * (app/Validator.php:138-160) - that check compares scheme/host/port
 * against base_url, which is an empty string in this dev config
 * (data/config.yaml), degrading its own practical intent to "is this a
 * local path, not an open redirect". Accepts a single leading "/",
 * rejects "//" (protocol-relative, i.e. a different host) and any
 * scheme (":" before the first "/").
 *
 * @param {string|null} value
 * @returns {boolean}
 */
export function isLocalPath(value) {
  if (typeof value !== 'string' || value === '') {
    return false;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return false;
  }

  const colonIndex = value.indexOf(':');
  const slashIndex = value.indexOf('/', 1);

  if (colonIndex !== -1 && (slashIndex === -1 || colonIndex < slashIndex)) {
    return false;
  }

  return true;
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {string} params.url
 * @param {string} params.username
 * @param {boolean} params.canRegister
 * @param {string|null} params.error
 */
export function renderLoginPage({ csrfToken, url, username, canRegister, error }) {
  const errorHtml = error
    ? `<div class="alert alert-danger" role="alert">${escapeHtml(error)}</div>`
    : '';

  const registerLinkHtml = canRegister
    ? `<a class="btn btn-link" href="/register">Request a new user account</a>`
    : '';

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-login">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="flash-messages">${errorHtml}</div>

            <h2 class="wt-page-title">Welcome to this genealogy website</h2>

            <form method="post" action="/login" class="wt-page-options wt-page-options-login">
                <input type="hidden" name="url" value="${escapeHtml(url)}">

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="username">Username</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input class="form-control" type="text" id="username" name="username" required="required" value="${escapeHtml(username)}" autocomplete="username">
                    </div>
                </div>

                <div class="row mb-3">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="password">Password</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input class="form-control" type="password" id="password" name="password" required="required" autocomplete="current-password">
                    </div>
                </div>

                <div class="row">
                    <div class="col-sm-3 col-form-label wt-page-options-label"></div>
                    <div class="col-sm-9 wt-page-options-value">
                        <button class="btn btn-primary" type="submit">sign in</button>

                        <a class="btn btn-link" href="/password-request">Forgot password?</a>

                        ${registerLinkHtml}
                    </div>
                </div>

                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            </form>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
