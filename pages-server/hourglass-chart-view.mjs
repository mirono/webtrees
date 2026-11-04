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

// View layer for /tree/{tree}/hourglass-{generations}-{spouses}/{xref}
// (HourglassChartModule, phase 5 step 29). Unlike Ancestors/Descendancy,
// this chart shows BOTH directions from one subject at once (parents
// fanning out to the right, children fanning out to the left - see
// resources/views/modules/hourglass-chart/chart.phtml), has no
// alternate "individuals"/"families" table style, and - the real new
// piece of infra this step needs - lazy-loads one further generation
// at a time past its own initial render via small AJAX "arrow" links
// (resources/views/modules/hourglass-chart/{parents,children}.phtml's
// own `.hourglass-arrow[data-wt-chart-xref]`, wired up by chart.phtml's
// own inline <script>, reproduced verbatim below since it's page-
// specific markup, not part of the already-bundled webtrees.min.js).

import { renderChartBox } from './chart-box-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const ARROW_RIGHT_HTML = '<span class="wt-icon-arrow-right wt-icon-flip-rtl"><i class="fa-solid fa-arrow-right wt-icon-flip-rtl"></i></span>';
const ARROW_LEFT_HTML = '<span class="wt-icon-arrow-left wt-icon-flip-rtl"><i class="fa-solid fa-arrow-left wt-icon-flip-rtl"></i></span>';

/**
 * Mirrors modules/hourglass-chart/parents.phtml exactly - one family
 * (husband + wife, each possibly null per their own canShowName()
 * gate), each side optionally followed by either a nested recursive
 * call (more generations remain) or a lazy-load arrow (they don't).
 *
 * @param {{
 *   familyXref: string,
 *   husband: { box: object|null, further: {kind: 'nested', node: object} | {kind: 'arrow', familyXref: string} | null },
 *   wife: { box: object|null, further: {kind: 'nested', node: object} | {kind: 'arrow', familyXref: string} | null },
 * }} node see buildHourglassAncestorsNode() in index.mjs for the exact shape
 * @param {string} treeName
 * @returns {string}
 */
export function renderHourglassAncestorsNode(node, treeName) {
  const renderSide = (side) => {
    const boxHtml = `
            <div class="align-self-center">${renderChartBox(side.box)}</div>`;

    if (side.further === null) {
      return boxHtml;
    }

    if (side.further.kind === 'nested') {
      return `${boxHtml}
            ${renderHourglassAncestorsNode(side.further.node, treeName)}`;
    }

    const actionUrl = `/module/hourglass_chart/Ancestors/${escapeHtml(treeName)}?xref=${escapeHtml(encodeURIComponent(side.further.familyXref))}`;

    return `${boxHtml}
            <div class="align-self-center">
                <div class="hourglass-arrow" data-wt-chart-xref="${actionUrl}">
                    ${ARROW_RIGHT_HTML}
                </div>
            </div>`;
  };

  return `
<div class="d-flex">
    <div class="wt-chart-horizontal-spacer">
        <div class="wt-chart-horizontal-line"></div>
    </div>
    <div class="align-self-center">
        <div class="d-flex">
            <div class="wt-chart-horizontal-spacer">
                <div class="wt-chart-horizontal-first-parent"></div>
            </div>${renderSide(node.husband)}
        </div>
        <div class="d-flex">
            <div class="wt-chart-horizontal-spacer">
                <div class="wt-chart-horizontal-last-parent"></div>
            </div>${renderSide(node.wife)}
        </div>
    </div>
</div>`;
}

/**
 * Mirrors modules/hourglass-chart/children.phtml exactly - a list of
 * children (each possibly with its own spouse boxes, when `spouses` is
 * set), each optionally preceded by either a nested recursive call
 * (grandchildren exist and generations remain) or a lazy-load arrow
 * (grandchildren exist but generations ran out) - and connecting-line
 * classes that depend on the item's position in the list, matching
 * `$n`/`$children->count()` in the real template exactly.
 *
 * @param {Array<{
 *   box: object,
 *   spouseBoxes: Array<object|null>,
 *   further: {kind: 'nested', items: object[]} | {kind: 'arrow', xref: string} | null,
 * }>} items see buildHourglassDescendantsNode() in index.mjs for the exact shape
 * @param {string} treeName
 * @param {boolean} spouses
 * @returns {string}
 */
export function renderHourglassDescendantsNode(items, treeName, spouses) {
  const itemsHtml = items
    .map((item, n) => {
      let furtherHtml = '';

      if (item.further !== null) {
        if (item.further.kind === 'nested') {
          furtherHtml = `
            ${renderHourglassDescendantsNode(item.further.items, treeName, spouses)}`;
        } else {
          const actionUrl = `/module/hourglass_chart/Descendants/${escapeHtml(treeName)}?xref=${escapeHtml(encodeURIComponent(item.further.xref))}&spouses=${spouses ? '1' : '0'}`;

          furtherHtml = `
            <div class="d-flex align-self-center">
                <div class="hourglass-arrow" data-wt-chart-xref="${actionUrl}">
                    ${ARROW_LEFT_HTML}
                </div>
            </div>`;
        }
      }

      const leadingSpacerHtml = spouses ? '\n                <div>&nbsp;</div>' : '';
      const spouseBoxesAndTrailingSpacerHtml = spouses
        ? `${item.spouseBoxes.map((box) => renderChartBox(box)).join('')}
                <div>&nbsp;</div>`
        : '';

      let lineHtml;

      if (items.length === 1) {
        lineHtml = '<div class="wt-chart-horizontal-line"></div>';
      } else if (n === 0) {
        lineHtml = '<div class="wt-chart-horizontal-first-child"></div>';
      } else if (n + 1 === items.length) {
        lineHtml = '<div class="wt-chart-horizontal-last-child"></div>';
      } else {
        lineHtml = '<div class="wt-chart-horizontal-middle-child"><div class="wt-chart-horizontal-line"></div></div>';
      }

      return `
        <div class="d-flex justify-content-end">${furtherHtml}
            <div class="align-self-center">${leadingSpacerHtml}
                ${renderChartBox(item.box)}${spouseBoxesAndTrailingSpacerHtml}
            </div>
            <div class="wt-chart-horizontal-spacer">
                ${lineHtml}
            </div>
        </div>`;
    })
    .join('');

  const trailingSpacerHtml =
    items.length > 0
      ? `
    <div class="wt-chart-horizontal-spacer">
        <div class="wt-chart-horizontal-line"></div>
    </div>`
      : '';

  return `<div class="align-self-center">${itemsHtml}
</div>${trailingSpacerHtml}`;
}

/**
 * Mirrors modules/hourglass-chart/chart.phtml - the AJAX-loaded body:
 * descendants fanning out to the left, the subject (+ spouses, if
 * requested) in the middle, ancestors fanning out to the right - plus
 * the inline <script> that wires up every `.hourglass-arrow`'s
 * click-to-expand behavior via jQuery's own `.load()` (event
 * delegation on `.wt-chart-hourglass`, so arrows added later by a
 * previous `.load()` call still work without re-registering anything).
 *
 * @param {object} params
 * @param {object} params.individualBox
 * @param {object[]} params.spouseBoxes
 * @param {object[]} params.descendantsItems
 * @param {object|null} params.ancestorsNode
 * @param {string} params.treeName
 * @param {boolean} params.spouses
 * @returns {string}
 */
export function renderHourglassChart({ individualBox, spouseBoxes, descendantsItems, ancestorsNode, treeName, spouses }) {
  const spousesHtml = spouseBoxes.map((box) => renderChartBox(box)).join('');
  const ancestorsHtml = ancestorsNode !== null ? renderHourglassAncestorsNode(ancestorsNode, treeName) : '';

  return `
<div class="d-flex wt-chart-hourglass">
    ${renderHourglassDescendantsNode(descendantsItems, treeName, spouses)}
    <div class="align-self-center">
        ${renderChartBox(individualBox)}${spousesHtml}
    </div>${ancestorsHtml}
</div>

<script>
    $(".wt-chart-hourglass").on("click", ".hourglass-arrow[data-wt-chart-xref]", function () {
        $(this.parentNode).load(this.dataset.wtChartXref);

        return false;
    });
</script>`;
}

/**
 * Full page: /tree/{tree}/hourglass-{generations}-{spouses}/{xref}.
 * Mirrors resources/views/modules/hourglass-chart/page.phtml - an
 * options form (individual/generations/show-spouses) plus an
 * ajax-loaded content div, same shape as ancestors-chart-view.mjs's
 * own renderAncestorsChartPage() (see that function's own doc comment
 * for the dir="ltr" note, which applies here unchanged).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string, fullNameHtml: string}} params.individual
 * @param {number} params.generations
 * @param {number} params.minGenerations
 * @param {number} params.maxGenerations
 * @param {boolean} params.spouses
 * @param {string} params.ajaxUrl
 * @returns {string}
 */
export function renderHourglassChartPage({ tree, user, csrfToken, title, individual, generations, minGenerations, maxGenerations, spouses, ajaxUrl , genealogyMenuHtml = '' }) {
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
<body class="wt-global wt-theme-webtrees wt-route-hourglass-chart-page">
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

                    <form method="post" class="wt-page-options wt-page-options-hourglass-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(individual.xref)}" required>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="generations">Generations</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="generations" name="generations" type="number" min="${minGenerations}" max="${maxGenerations}" value="${generations}" required>
                            </div>
                        </div>
                        <fieldset class="row mb-3">
                            <legend class="col-form-label col-sm-3 wt-page-options-label">Layout</legend>
                            <div class="col-sm-9 wt-page-options-value">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" name="spouses" id="spouses" value="1"${spouses ? ' checked="checked"' : ''}>
                                    <label class="form-check-label" for="spouses">Show spouses</label>
                                </div>
                            </div>
                        </fieldset>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="btn btn-primary" type="submit" value="view">
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content wt-chart wt-chart-hourglass" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
