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

// Hand-rolled HTML for /tree/{tree}/source/{xref} - a deliberately
// scoped-down replica of the shared resources/views/record-page.phtml
// (used for Source/Note/Media/Repository/Submitter alike in real PHP),
// same convention as individual-view.mjs/family-view.mjs (dir="ltr",
// escapeHtml(), CSRF meta tag only when logged in, real fact.phtml
// class names). See docs/php-to-js-migration/phase5-source-page.md for
// the full scope: title + basic source facts only - no linked-record
// reverse-lookup sections.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Verified against app/Gedcom.php's real 'SOUR:TAG' element
// definitions, not guessed.
const FACT_LABELS = {
  TITL: 'Title',
  AUTH: 'Author',
  PUBL: 'Publication',
  ABBR: 'Abbreviation',
  TEXT: 'Text',
  REPO: 'Repository',
  CHAN: 'Last change',
};

/**
 * Matches resources/views/fact.phtml's real 2-column row shape and
 * class names - same convention already established for
 * individual-view.mjs/family-view.mjs's own renderFact(). Most source
 * facts are plain VALUE text (TITL/AUTH/PUBL/ABBR/TEXT), not DATE/PLAC-
 * structured events like Individual/Family's - rendered via the real
 * `wt-fact-value` class rather than `wt-fact-place`. `value` may
 * contain embedded newlines (joined CONT/CONC continuation lines, e.g.
 * for a long TEXT transcription) - rendered as <br> after escaping.
 * REPO is the one exception: mirrors XrefRepository::value()
 * (app/Elements/AbstractXrefElement.php's valueXrefLink()) - a link to
 * the repository's own page (still PHP-served; index.mjs resolves
 * `repoUrl`/`repoNameHtml` via phpRouteUrl() so this works correctly
 * whether or not rewrite_urls is on), not a plain value div.
 * `otherAttributes` mirrors fact.phtml's real "wt-fact-other-attributes"
 * block (source.mjs's sourceFactOtherAttributes()) - any subtag not
 * already covered by this fact's own specific rendering, e.g. TITL's
 * `_HEB` transliteration or REPO's `CALN` call number, each its own
 * label/value line matching AbstractElement::labelValue()'s real
 * markup (same bolded-`.label` convention as the CHAN author line).
 */
function renderFact({ tag, value, date, time, author, repoUrl, repoNameHtml, otherAttributes = [] }) {
  const label = FACT_LABELS[tag] ?? tag;
  const valueHtml =
    tag === 'REPO'
      ? repoUrl !== undefined
        ? `<div class="wt-fact-value"><a href="${escapeHtml(repoUrl)}">${repoNameHtml}</a></div>`
        : ''
      : value
        ? `<div class="wt-fact-value">${escapeHtml(value).replaceAll('\n', '<br>')}</div>`
        : '';
  const timeHtml = time ? ` – <span class="date">${escapeHtml(time)}</span>` : '';
  const dateHtml = date ? `<span class="wt-fact-date-age"><span class="date">${escapeHtml(date)}</span>${timeHtml}</span>` : '';
  const authorHtml =
    tag === 'CHAN' && author
      ? `<div class="wt-fact-place"><span class="label">Author of last change</span>: <span class="value align-top">${escapeHtml(author)}</span></div>`
      : '';
  const otherAttributesHtml = otherAttributes
    .map(
      ({ label: attrLabel, value: attrValue }) =>
        `<div><span class="label">${escapeHtml(attrLabel)}</span>: <span class="value align-top">${escapeHtml(attrValue).replaceAll('\n', '<br>')}</span></div>`,
    )
    .join('');

  return `
        <tr>
            <th scope="row">
                <div class="wt-fact-label">${escapeHtml(label)}</div>
                <span class="wt-fact-icon wt-fact-icon-${escapeHtml(tag)}" title="${escapeHtml(label)}"></span>
            </th>
            <td>
                <div class="wt-fact-main-attributes">
                    ${valueHtml}
                    ${dateHtml}
                    ${authorHtml}
                </div>
                <div class="wt-fact-other-attributes mt-2">
                    ${otherAttributesHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {{
 *   xref: string,
 *   fullNameHtml: string,
 *   facts: {tag: string, value: string, date: string, time: string, author: string, repoUrl?: string, repoNameHtml?: string, otherAttributes?: {label: string, value: string}[]}[],
 * }} params.source `fullNameHtml` (and a REPO fact's `repoNameHtml`) is
 *   PRE-ESCAPED SAFE HTML (see pages-server/individual.mjs's
 *   extractNameFromFact()) - inserted RAW, never passed through
 *   escapeHtml() again. `repoUrl`/`repoNameHtml` are present only for
 *   a REPO fact whose referenced repository still exists.
 */
export function renderSourcePage({ tree, user, csrfToken, source }) {
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

  const factsHtml =
    source.facts.length > 0
      ? `
    <table class="table wt-facts-table">
        <tbody>${source.facts.map(renderFact).join('')}
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
    <title>${source.fullNameHtml.replace(/<[^>]*>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-source-page">
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
                    <h2 class="wt-page-title">${source.fullNameHtml}</h2>${factsHtml}
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
