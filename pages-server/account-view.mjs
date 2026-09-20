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

// Hand-rolled HTML for /my-account - a deliberately scoped-down replica
// of resources/views/edit-account-page.phtml (the form fields) plus
// just enough of layouts/default.phtml's chrome (header, "Sign out",
// flash-message area) to look and behave consistently. NOT in scope:
// the genealogy/tree-switcher menu, theme selector, quick search,
// module hooks (ModuleGlobalInterface) - this is a "prove the pattern"
// milestone, not pixel-perfect parity. See
// docs/php-to-js-migration/phase5-first-node-route.md.
//
// References the same /public/css/*.min.css and /public/js/*.min.js
// files PHP already serves (the reverse proxy sends /public/* straight
// to PHP - see proxy/index.mjs) - no asset duplication needed.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderSelect(name, options, selected) {
  const optionsHtml = options
    .map(([value, label]) => {
      const isSelected = String(value) === String(selected) ? ' selected="selected"' : '';

      return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(label)}</option>`;
    })
    .join('\n');

  return `<select class="form-select" name="${escapeHtml(name)}" id="${escapeHtml(name)}">\n${optionsHtml}\n</select>`;
}

/**
 * @param {object} params
 * @param {{userId: number, userName: string, realName: string, email: string, settings: Record<string,string>}} params.user
 * @param {[string, string][]} params.contactMethods
 * @param {[string, string][]} params.languages
 * @param {[string, string][]} params.timezones
 * @param {string} params.csrfToken
 * @param {{status: string, text: string}|null} params.message
 */
export function renderAccountPage({ user, contactMethods, languages, timezones, csrfToken, message }) {
  const language = user.settings.language ?? 'en-US';
  const timezone = user.settings.TIMEZONE ?? 'UTC';
  const contactMethod = user.settings.contactmethod ?? '';
  const visibleOnline = user.settings.visibleonline === '1';

  const messageHtml = message
    ? `<div class="alert alert-${escapeHtml(message.status)}" role="alert">${escapeHtml(message.text)}</div>`
    : '';

  // Matches AccountEdit.php's own show_delete_option computation
  // exactly (app/Http/RequestHandlers/AccountEdit.php:69):
  // getPreference(PREF_IS_ADMINISTRATOR) !== '1' - 'canadmin' is that
  // preference's real wt_user_setting.setting_name (confirmed against
  // app/Contracts/UserInterface.php, not the PHP constant name).
  const showDeleteOption = user.settings.canadmin !== '1';

  const deleteAccountHtml = showDeleteOption
    ? `<div class="row mb-3">
                    <div class="col-sm-3 wt-page-options-label"></div>
                    <div class="col-sm-9 wt-page-options-value">
                        <a href="#" class="btn btn-danger" data-wt-confirm="Are you sure you want to delete “${escapeHtml(user.userName)}”?" data-wt-post-url="/my-account-delete">Delete your account</a>
                    </div>
                </div>`
    : '';

  // dir="ltr" is required, not decorative: both vendor.min.css (Bootstrap
  // 5.3's RTL-aware CSS) and webtrees.min.css scope large numbers of
  // rules - including .row's own gutter margins/padding and
  // .wt-page-options-label's background color - behind a "[dir]"
  // ancestor attribute selector, matching PHP's own
  // <html dir="<?= I18N::locale()->direction() ?>" ...> (layouts/default.phtml).
  // Without it, those rules simply never match - confirmed live: this
  // was the actual cause of a reported "looks awful" page (raw
  // borderless-gutter inputs, invisible white-on-white labels), not a
  // stylesheet-loading failure. Hardcoded to "ltr" (not derived from
  // the user's language) because this page's own copy is hardcoded
  // English throughout already (see lang="en" below) - matching that
  // existing scope, not a new one.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - the "Sign out" link's
         data-wt-post-url handler (init.js:166-178) calls httpPost(),
         so without this tag "Sign out" silently does nothing when
         clicked. Confirmed live as a real bug, not hypothetical. -->
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My account</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-my-account">
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
            <div class="flash-messages">${messageHtml}</div>

            <h2 class="wt-page-title">My account</h2>

            <form method="post" class="wt-page-options wt-page-options-my-account">
                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="user-name">Username</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input type="text" class="form-control" id="user-name" name="user_name" value="${escapeHtml(user.userName)}" dir="auto" required="required">
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="real-name">Real name</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input type="text" class="form-control" id="real-name" name="real_name" value="${escapeHtml(user.realName)}" dir="auto" required="required">
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="password">Password</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input type="password" class="form-control" id="password" name="password" autocomplete="new-password">
                        <div class="form-text">Leave the password blank if you want to keep the current password.</div>
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="language">Language</label>
                    <div class="col-sm-9 wt-page-options-value">
                        ${renderSelect('language', languages, language)}
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="timezone">Time zone</label>
                    <div class="col-sm-9 wt-page-options-value">
                        ${renderSelect('timezone', timezones, timezone)}
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="email">Email address</label>
                    <div class="col-sm-9 wt-page-options-value">
                        <input class="form-control" type="email" id="email" name="email" value="${escapeHtml(user.email)}">
                    </div>
                </div>

                <div class="row">
                    <label class="col-sm-3 col-form-label wt-page-options-label" for="contact-method">Contact method</label>
                    <div class="col-sm-9 wt-page-options-value">
                        ${renderSelect('contact-method', contactMethods, contactMethod)}
                    </div>
                </div>

                <fieldset class="row">
                    <legend class="col-sm-3 col-form-label wt-page-options-label">Visible online</legend>
                    <div class="col-sm-9 wt-page-options-value">
                        <div class="form-check">
                            <input type="checkbox" class="form-check-input" name="visible-online" id="visible-online" value="1"${visibleOnline ? ' checked="checked"' : ''}>
                            <label class="form-check-label" for="visible-online">Visible to other users when online</label>
                        </div>
                    </div>
                </fieldset>

                <div class="row mb-3">
                    <div class="col-sm-3 wt-page-options-label"></div>
                    <div class="col-sm-9 wt-page-options-value">
                        <button type="submit" class="btn btn-primary">save</button>
                    </div>
                </div>

                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            </form>

            ${deleteAccountHtml}
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
