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

// View layer for /tree/{tree}/compact/{xref} (CompactTreeChartModule,
// phase 5 step 31) - the FIFTH chart route, and the simplest: always
// exactly 5 fixed generations of ancestors (no generations/style/
// spouses tokens at all), laid out in a FIXED-POSITION HTML table
// (resources/views/modules/compact-chart/chart.phtml - 14 literal
// rows, each cell hardcoded to a specific Sosa-Stradonitz number, 1
// through 31) rather than any recursive structure. Each "arrow" here
// is a plain `<a href>` to a brand-new full page load of this same
// chart rooted at that ancestor (CompactTreeChartModule::chartUrl())
// - NOT a lazy-load AJAX arrow like Hourglass's - so no new
// client-side JS is needed at all, the simplest chart yet.

import { renderChartBox } from './chart-box-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const ARROW_ICONS = {
  up: '<span class="wt-icon-arrow-up"><i class="fa-solid fa-arrow-up"></i></span>',
  down: '<span class="wt-icon-arrow-down"><i class="fa-solid fa-arrow-down"></i></span>',
  left: '<span class="wt-icon-arrow-left wt-icon-flip-rtl"><i class="fa-solid fa-arrow-left wt-icon-flip-rtl"></i></span>',
  right: '<span class="wt-icon-arrow-right wt-icon-flip-rtl"><i class="fa-solid fa-arrow-right wt-icon-flip-rtl"></i></span>',
};

/**
 * Mirrors modules/compact-chart/individual.phtml - unlike every other
 * chart's own placeholder (chart-box.phtml's bare
 * `<div class="wt-chart-box"></div>`), a missing ancestor here gets
 * `<div class="h-100 wt-chart-box">&nbsp;</div>` - its own distinct
 * markup, not chart-box.phtml's.
 *
 * @param {{box: object}|null} cell see buildCompactTreeChartCells() in
 *   index.mjs for the exact shape
 * @returns {string}
 */
function renderIndividualCell(cell) {
  if (cell === null) {
    return '<div class="h-100 wt-chart-box">&nbsp;</div>';
  }

  return renderChartBox(cell.box);
}

/**
 * Mirrors modules/compact-chart/arrow-{up,down,left,right}.phtml - a
 * plain link to a full-page reload of this same chart rooted at that
 * ancestor when present, or just the bare icon (no link) when that
 * position is empty.
 *
 * @param {'up'|'down'|'left'|'right'} direction
 * @param {{href: string, title: string}|null} cell
 * @returns {string}
 */
function renderArrowCell(direction, cell) {
  const icon = ARROW_ICONS[direction];

  if (cell === null) {
    return icon;
  }

  return `<a href="${escapeHtml(cell.href)}" title="${escapeHtml(cell.title)}">${icon}</a>`;
}

/**
 * The AJAX-loaded body: the fixed 14-row, 11-column table, reproduced
 * cell-for-cell from real PHP's own hardcoded Sosa-Stradonitz layout.
 *
 * @param {Array<{box: object, href: string, title: string}|null>} cells
 *   indexed 1-31 (index 0 unused) - see buildCompactTreeChartCells()
 *   in index.mjs for the exact shape
 * @returns {string}
 */
export function renderCompactTreeChart(cells) {
  const individual = (sosa) => renderIndividualCell(cells[sosa] ?? null);
  const arrow = (direction, sosa) => renderArrowCell(direction, cells[sosa] ?? null);

  return `
<table class="text-center w-100 h-100 wt-chart-compact-table" role="presentation">
    <tr>
        <td>${individual(16)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td class="h-100">${individual(18)}</td>
        <td></td>
        <td>${individual(24)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${individual(26)}</td>
    </tr>
    <tr>
        <td>${arrow('up', 16)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('up', 18)}</td>
        <td></td>
        <td>${arrow('up', 24)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('up', 26)}</td>
    </tr>
    <tr>
        <td>${individual(8)}</td>
        <td>${arrow('left', 8)}</td>
        <td>${individual(4)}</td>
        <td>${arrow('right', 9)}</td>
        <td>${individual(9)}</td>
        <td></td>
        <td>${individual(12)}</td>
        <td>${arrow('left', 12)}</td>
        <td>${individual(6)}</td>
        <td>${arrow('right', 13)}</td>
        <td>${individual(13)}</td>
    </tr>
    <tr>
        <td>${arrow('down', 17)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('down', 19)}</td>
        <td></td>
        <td>${arrow('down', 25)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('down', 27)}</td>
    </tr>
    <tr>
        <td>${individual(17)}</td>
        <td></td>
        <td>${arrow('up', 4)}</td>
        <td></td>
        <td>${individual(19)}</td>
        <td></td>
        <td>${individual(25)}</td>
        <td></td>
        <td>${arrow('up', 6)}</td>
        <td></td>
        <td>${individual(27)}</td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td>${individual(2)}</td>
        <td></td>
        <td colspan="3">
            <table class="w-100">
                <tr>
                    <td class="w-25">${arrow('left', 2)}</td>
                    <td class="w-50">${individual(1)}</td>
                    <td class="w-25">${arrow('right', 3)}</td>
                </tr>
            </table>
        </td>
        <td></td>
        <td>${individual(3)}</td>
        <td></td>
        <td></td>
    </tr>
    <tr>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
    </tr>
    <tr>
        <td>${individual(20)}</td>
        <td></td>
        <td>${arrow('down', 5)}</td>
        <td></td>
        <td>${individual(22)}</td>
        <td></td>
        <td>${individual(28)}</td>
        <td></td>
        <td>${arrow('down', 7)}</td>
        <td></td>
        <td>${individual(30)}</td>
    </tr>
    <tr>
        <td>${arrow('up', 20)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('up', 22)}</td>
        <td></td>
        <td>${arrow('up', 28)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('up', 30)}</td>
    </tr>
    <tr>
        <td>${individual(10)}</td>
        <td>${arrow('left', 10)}</td>
        <td>${individual(5)}</td>
        <td>${arrow('right', 11)}</td>
        <td>${individual(11)}</td>
        <td></td>
        <td>${individual(14)}</td>
        <td>${arrow('left', 14)}</td>
        <td>${individual(7)}</td>
        <td>${arrow('right', 15)}</td>
        <td>${individual(15)}</td>
    </tr>
    <tr>
        <td>${arrow('down', 21)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('down', 23)}</td>
        <td></td>
        <td>${arrow('down', 29)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${arrow('down', 31)}</td>
    </tr>
    <tr>
        <td>${individual(21)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${individual(23)}</td>
        <td></td>
        <td>${individual(29)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td>${individual(31)}</td>
    </tr>
</table>`;
}

/**
 * Full page: /tree/{tree}/compact/{xref}. Mirrors
 * resources/views/modules/compact-chart/page.phtml - the simplest
 * options form of any chart ported so far (just the individual
 * field, no generations/style/spouses) plus an ajax-loaded content
 * div. Same dir="ltr" convention as every other chart page (see
 * ancestors-chart-view.mjs's own doc comment for why).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string}} params.individual
 * @param {string} params.ajaxUrl
 * @returns {string}
 */
export function renderCompactTreeChartPage({ tree, user, csrfToken, title, individual, ajaxUrl , genealogyMenuHtml = '' }) {
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

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-compact-tree-chart-page">
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
                    <h2 class="wt-page-title">${title}</h2>

                    <form method="post" class="wt-page-options wt-page-options-compact-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(individual.xref)}" required>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="btn btn-primary" type="submit" value="view">
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content wt-chart wt-chart-compact" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
