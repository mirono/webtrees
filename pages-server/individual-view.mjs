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

// Hand-rolled HTML for /tree/{tree}/individual/{xref} - a deliberately
// scoped-down replica of resources/views/individual-page*.phtml, same
// convention as tree-view.mjs (dir="ltr", escapeHtml(), CSRF meta tag
// only when logged in). See docs/php-to-js-migration/phase5-individual-page.md
// for the full scope: identity header (name/sex/lifespan/age) + a flat
// list of vital-event facts only - no tabs, no sidebars, no charts.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const FACT_LABELS = {
  BIRT: 'Birth',
  CHR: 'Christening',
  BAPM: 'Baptism',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Cremation',
};

/**
 * Matches resources/views/fact.phtml's ACTUAL row shape (a 2-column
 * `<th scope="row">` label / `<td>` value table, not the 3-column
 * descriptionbox/rela layout an earlier draft of this file guessed at
 * - that guess used CSS classes from webtrees' pre-Bootstrap-5 theme,
 * which don't exist at all in this app's real webtrees.min.css,
 * leaving the whole table unstyled). Reduced to the label/date/place a
 * v1 vital-facts list needs - no Elements-driven value formatting, no
 * sub-fact citations (SOUR/NOTE/OBJE), no edit controls - but using
 * the REAL class names (`wt-fact-label`, `wt-fact-icon-<TAG>`,
 * `wt-fact-date-age`, `date`, `wt-fact-place`) so the existing
 * stylesheet actually applies.
 */
function renderFact({ tag, date, place }) {
  const label = FACT_LABELS[tag] ?? tag;
  const dateHtml = date ? `<span class="wt-fact-date-age"><span class="date">${escapeHtml(date)}</span></span>` : '';
  const placeHtml = place ? `<div class="wt-fact-place">${escapeHtml(place)}</div>` : '';

  return `
        <tr>
            <th scope="row">
                <div class="wt-fact-label">${escapeHtml(label)}</div>
                <span class="wt-fact-icon wt-fact-icon-${escapeHtml(tag)}" title="${escapeHtml(label)}"></span>
            </th>
            <td>
                <div class="wt-fact-main-attributes">
                    ${dateHtml}
                    ${placeHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * Mirrors RelativesTabModule's parent_families/spouse_families
 * (app/Module/RelativesTabModule.php), reduced to a flat list of
 * links rather than the full per-member chart-box + relationship-name
 * rendering `modules/relatives/family.phtml` does (that's effectively
 * re-embedding FamilyPage's own member cards inline - a bigger lift
 * deferred for this v1). Reuses the real `wt-facts-table`/
 * `table table-sm` wrapper classes so it's visually consistent with
 * the vital-facts table below it, rather than inventing new ones.
 *
 * @param {{titleHtml: string, url: string}[]} parentFamilies
 * @param {{titleHtml: string, url: string}[]} spouseFamilies
 */
function renderFamiliesSection(parentFamilies, spouseFamilies) {
  if (parentFamilies.length === 0 && spouseFamilies.length === 0) {
    return '';
  }

  const parentRows = parentFamilies
    .map(
      (family) => `
        <tr>
            <th scope="row">Parents</th>
            <td><a href="${escapeHtml(family.url)}">${family.titleHtml}</a></td>
        </tr>`,
    )
    .join('');
  const spouseRows = spouseFamilies
    .map(
      (family) => `
        <tr>
            <th scope="row">Spouse family</th>
            <td><a href="${escapeHtml(family.url)}">${family.titleHtml}</a></td>
        </tr>`,
    )
    .join('');

  return `
                    <h3 class="mt-4">Families</h3>
    <table class="table table-sm wt-facts-table">
        <tbody>${parentRows}${spouseRows}
        </tbody>
    </table>`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {{
 *   xref: string,
 *   fullNameHtml: string,
 *   lifespan: string,
 *   age: string,
 *   facts: {tag: string, date: string, place: string}[],
 *   parentFamilies: {titleHtml: string, url: string}[],
 *   spouseFamilies: {titleHtml: string, url: string}[],
 * }} params.individual `fullNameHtml` is PRE-ESCAPED SAFE HTML (see
 *   pages-server/individual.mjs's addName()) - inserted RAW, never
 *   passed through escapeHtml() again. `titleHtml` in each family
 *   entry is likewise pre-escaped (built from two such fullNameHtml
 *   values in pages-server/index.mjs).
 */
export function renderIndividualPage({ tree, user, csrfToken, individual }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as tree-view.mjs. -->`
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

  const familiesHtml = renderFamiliesSection(individual.parentFamilies, individual.spouseFamilies);

  const factsHtml =
    individual.facts.length > 0
      ? `
    <table class="table wt-facts-table">
        <tbody>${individual.facts.map(renderFact).join('')}
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
    <title>${escapeHtml(individual.xref)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-individual-page">
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
                    <h2 class="wt-page-title">${individual.fullNameHtml} <span class="wt-lifespan">${escapeHtml(individual.lifespan)}</span> ${escapeHtml(individual.age)}</h2>${familiesHtml}${factsHtml}
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
