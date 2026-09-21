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

// Hand-rolled HTML for /tree/{tree}/family/{xref} - a deliberately
// scoped-down replica of resources/views/family-page*.phtml, same
// convention as individual-view.mjs (dir="ltr", escapeHtml(), CSRF
// meta tag only when logged in). See
// docs/php-to-js-migration/phase5-family-page.md for the full scope:
// husband/wife/children identity cards (each linking to their own now-
// real /tree/{tree}/individual/{xref} Node route) + marriage/divorce
// vital facts only - no full facts-and-events table, no chart links.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const UNKNOWN_NAME_HTML = '<span class="NAME" dir="auto" translate="no">…</span>';

const FACT_LABELS = {
  MARR: 'Marriage',
  DIV: 'Divorce',
  ANUL: 'Annulment',
  _SEPR: 'Separation',
};

/**
 * @param {{fullNameHtml: string, lifespan: string, url: string}|null} member
 * @param {string} roleLabel e.g. "Husband", "Wife", "Child"
 */
function renderMemberCard(member, roleLabel) {
  if (member === null) {
    return `
        <div class="wt-family-member">
            <div class="wt-family-member-role text-muted">${escapeHtml(roleLabel)}</div>
            ${UNKNOWN_NAME_HTML}
        </div>`;
  }

  return `
        <div class="wt-family-member">
            <div class="wt-family-member-role text-muted">${escapeHtml(roleLabel)}</div>
            <a href="${escapeHtml(member.url)}">${member.fullNameHtml}</a>
            <span class="wt-lifespan">${escapeHtml(member.lifespan)}</span>
        </div>`;
}

function renderFact({ tag, date, place }) {
  const label = FACT_LABELS[tag] ?? tag;

  return `
        <tr>
            <td class="descriptionbox rela">${escapeHtml(label)}</td>
            <td class="descriptionbox">${escapeHtml(date)}</td>
            <td class="descriptionbox">${escapeHtml(place)}</td>
        </tr>`;
}

/**
 * @param {object} params
 * @param {{name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {{
 *   husband: {fullNameHtml: string, lifespan: string, url: string}|null,
 *   wife: {fullNameHtml: string, lifespan: string, url: string}|null,
 *   children: {fullNameHtml: string, lifespan: string, url: string}[],
 *   facts: {tag: string, date: string, place: string}[],
 * }} params.family `husband`/`wife` are null both when the reference
 *   is absent AND when it's present but not currently shown to this
 *   viewer (matches Family::husband()/wife()'s own canShowName()-gated
 *   null-or-Individual return shape) - the view can't tell the two
 *   cases apart and doesn't need to, same as PHP's own template.
 */
export function renderFamilyPage({ tree, user, csrfToken, family }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as individual-view.mjs. -->`
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

  const titleHtml = `${family.husband !== null ? family.husband.fullNameHtml : UNKNOWN_NAME_HTML} + ${
    family.wife !== null ? family.wife.fullNameHtml : UNKNOWN_NAME_HTML
  }`;

  const childrenHtml = family.children.map((child) => renderMemberCard(child, 'Child')).join('');

  const factsHtml =
    family.facts.length > 0
      ? `
    <table class="table wt-facts-table">
        <tbody>${family.facts.map(renderFact).join('')}
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
    <title>${titleHtml.replace(/<[^>]*>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-family-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.name)}</h1>
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
                    <h2 class="wt-page-title">${titleHtml}</h2>

                    <div class="wt-family-members d-flex">
                        ${renderMemberCard(family.husband, 'Husband')}
                        ${renderMemberCard(family.wife, 'Wife')}
                        ${childrenHtml}
                    </div>${factsHtml}
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
