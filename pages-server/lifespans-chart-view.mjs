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

// View layer for /tree/{tree}/lifespans (LifespansChartModule, phase 5
// step 34). Mirrors resources/views/modules/lifespans-chart/chart.phtml
// and page.phtml - always LTR positioning (`left:`, never `right:`),
// same already-established "this migration doesn't port the RTL
// direction toggle" simplification as every other page.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors modules/lifespans-chart/chart.phtml exactly: a decade scale
 * bar, then one absolutely-positioned bar per individual (click to
 * toggle a collapsible summary card below it showing their birth/
 * death facts).
 *
 * @param {object} params
 * @param {string} params.subtitle "N individuals"
 * @param {number} params.startYear
 * @param {number} params.endYear
 * @param {Array<{background: string, birthYear: number, deathYear: number, id: string, box: object, row: number}>} params.lifespans see layoutIndividuals() in lifespans-chart.mjs
 * @param {number} params.maxRows
 * @returns {string}
 */
export function renderLifespansChart({ subtitle, startYear, endYear, lifespans, maxRows }) {
  const decades = [];

  for (let year = startYear; year < endYear; year += 10) {
    decades.push(`<div class="wt-lifespans-decade">${year}</div>`);
  }

  const bars = lifespans
    .map((lifespan) => {
      const { box } = lifespan;
      const left = (lifespan.birthYear - startYear) * 7;
      const top = lifespan.row * 1.5;
      const width = (lifespan.deathYear - lifespan.birthYear) * 7 + 5;
      const summaryLeft = (Math.min(lifespan.birthYear, endYear - 50) - startYear) * 7;
      const summaryTop = (lifespan.row + 1) * 1.5;

      const summaryLines = [box.birthSummaryHtml, box.deathSummaryHtml].filter((line) => line !== '').join('<br>');

      return (
        `<a href="#" data-bs-toggle="collapse" data-bs-target="#${escapeHtml(lifespan.id)}" aria-expanded="false" aria-controls="${escapeHtml(lifespan.id)}">` +
        `<div class="wt-lifespans-individual position-absolute text-nowrap text-truncate" dir="auto" style="background: ${lifespan.background}; left:${left}px; top:${top}rem; width:${width}px;">` +
        `${box.fullNameHtml} ${escapeHtml(box.lifespanText)}` +
        '</div></a>' +
        `<div class="wt-lifespans-summary collapse position-absolute" id="${escapeHtml(lifespan.id)}" style="left:${summaryLeft}px; top:${summaryTop}rem; width:350px;">` +
        `<a class="wt-lifespans-summary-link" href="${escapeHtml(box.url)}">${box.fullNameHtml}</a>` +
        (summaryLines !== '' ? `<div>${summaryLines}</div>` : '') +
        '</div>'
      );
    })
    .join('');

  return (
    `<p class="wt-lifespans-subtitle">${escapeHtml(subtitle)}</p>` +
    `<div class="wt-lifespans-scale">${decades.join('')}</div>` +
    `<div class="wt-lifespans-individuals position-relative" style="height: ${(5 + maxRows) * 1.5}rem; width: ${(endYear - startYear) * 7}px;">${bars}</div>`
  );
}

/**
 * Full page: /tree/{tree}/lifespans. Mirrors
 * resources/views/modules/lifespans-chart/page.phtml - the options
 * form (add an individual/their family; a place-name/date-range
 * filter) plus an ajax-loaded content div. The "Add individuals" and
 * "Place" fields are plain text inputs, not real PHP's own
 * TomSelect-backed autocompletes - the same simplification already
 * used for every individual-xref field on every other chart's options
 * form (see e.g. compact-tree-chart-view.mjs) - but the place/date
 * filtering they drive is fully functional server-side (see
 * resolvePlaceId()/findIndividualsByDate()/findIndividualsByPlace()
 * in lifespans-chart.mjs).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {string[]} params.xrefs the accumulated xref list, carried forward as hidden fields
 * @param {string} params.resetUrl
 * @param {string} params.ajaxUrl
 * @param {string} [params.genealogyMenuHtml]
 * @returns {string}
 */
export function renderLifespansChartPage({ tree, user, csrfToken, title, xrefs, resetUrl, ajaxUrl, genealogyMenuHtml = '' }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">`
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

  const hiddenXrefs = xrefs.map((xref) => `<input name="xrefs[]" type="hidden" value="${escapeHtml(xref)}">`).join('');

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-lifespans-chart-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">${escapeHtml(title)}</h2>

                    <form method="post" class="wt-page-options wt-page-options-lifespans-chart d-print-none">
                        ${hiddenXrefs}
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="addxref">Add individuals</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="addxref" id="addxref">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" name="addfam" id="addfam" value="1">
                                    <label class="form-check-label" for="addfam">Include the individual's immediate family</label>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-sm-12 col-form-label wt-page-options-label">Select individuals by place or date</div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="place">Place</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="place" id="place">
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="start">Start year</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="start" name="start" type="text">
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="end">End year</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="end" name="end" type="text">
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <button type="submit" class="btn btn-primary">add</button>
                                <a class="btn btn-secondary" href="${escapeHtml(resetUrl)}">reset</a>
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content wt-chart wt-timeline-chart" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
