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

// View layer for
// /tree/{tree}/family-book-{book_size}-{generations}-{spouses}/{xref}
// (FamilyBookChartModule, phase 5 step 30) - the FOURTH chart route.
// Unlike Hourglass, this chart has no lazy-load arrows at all (no
// get*Action() methods in the real PHP module) - every ancestor/
// descendant "radius" box, even a placeholder for a missing relative,
// is rendered up front in one response. Structurally it's a flat,
// pre-order sequence of "family of X" blocks - one per individual
// along the FIRST `generations` descendant generations from the root -
// each block itself showing that individual's own ancestors/
// descendants out to `book_size - 1` further generations (see
// resources/views/modules/family-book-chart/chart.phtml: render self's
// block, then `<hr>` + recurse into chart.phtml again for EACH child,
// generations-1, same book_size).

import { renderChartBox } from './chart-box-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors modules/family-book-chart/parents.phtml exactly. Unlike
 * Hourglass's ancestors node, there is no lazy-load arrow fallback:
 * when `radiusRemaining > 1` this ALWAYS recurses one level deeper on
 * each side, even when that side has no box at all (mirrors real PHP's
 * own unconditional `if ($generations > 1): render parents.phtml
 * again, family: $family?->husband()?->childFamilies()->first()` -
 * which evaluates to a further `family: null` call once the chain runs
 * out, producing empty placeholder boxes all the way down to the
 * configured book_size, not a shorter chain that stops early).
 *
 * @param {{
 *   husband: { box: object|null, nested: object|null },
 *   wife: { box: object|null, nested: object|null },
 * }} node see buildFamilyBookParentsNode() in index.mjs for the exact shape
 * @returns {string}
 */
export function renderFamilyBookParentsNode(node) {
  const renderSide = (side, firstOrLastClass) => {
    const nestedHtml =
      side.nested !== null
        ? `
            <div class="wt-chart-horizontal-spacer">
                <div class="wt-chart-horizontal-line"></div>
            </div>
            ${renderFamilyBookParentsNode(side.nested)}`
        : '';

    return `
        <div class="d-flex">
            <div class="wt-chart-horizontal-spacer">
                <div class="${firstOrLastClass}"></div>
            </div>
            <div class="align-self-center">${renderChartBox(side.box)}</div>${nestedHtml}
        </div>`;
  };

  return `
<div class="d-flex">
    <div class="align-self-center">${renderSide(node.husband, 'wt-chart-horizontal-first-parent')}${renderSide(node.wife, 'wt-chart-horizontal-last-parent')}
    </div>
</div>`;
}

/**
 * Mirrors modules/family-book-chart/children.phtml exactly - same
 * connecting-line-class convention as
 * hourglass-chart-view.mjs's own renderHourglassDescendantsNode()
 * (first/middle/last/single, based on position in the list), but no
 * spouse boxes (real children.phtml never shows a descendant's spouse
 * - only chart.phtml's own center box does that, for the block's own
 * subject) and no lazy-load arrow (a radius that runs out before
 * grandchildren simply omits them, matching real PHP's own
 * `if ($generations > 1 && $grandchildren->isNotEmpty())` with no arrow
 * fallback branch at all).
 *
 * @param {Array<{box: object, nested: object[]|null}>} items see
 *   buildFamilyBookChildrenNode() in index.mjs for the exact shape
 * @returns {string}
 */
export function renderFamilyBookChildrenNode(items) {
  const itemsHtml = items
    .map((item, n) => {
      const nestedHtml = item.nested !== null ? renderFamilyBookChildrenNode(item.nested) : '';

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
        <div class="d-flex justify-content-end">${nestedHtml}
            <div class="align-self-center">${renderChartBox(item.box)}</div>
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
 * Mirrors modules/family-book-chart/chart.phtml's own non-recursive
 * part exactly - ONE "family of X" block: descendants (radiating
 * `book_size - 1` generations) fanning left, the individual (+
 * spouses, if requested) in the middle, ancestors (radiating the same
 * radius) fanning right. The outer per-generation recursion (the
 * `<hr>` + whole-chart-again-for-each-child loop) is handled by
 * renderFamilyBookChart() below, not here - matching how
 * buildFamilyBookBlocks() in index.mjs already flattens that recursion
 * into a plain array before this view layer ever sees it.
 *
 * @param {{
 *   fullNameHtml: string,
 *   individualBox: object,
 *   spouseBoxes: object[],
 *   childrenNode: object[],
 *   parentsNode: object,
 * }} block
 * @returns {string}
 */
function renderFamilyBookBlock(block) {
  const spousesHtml = block.spouseBoxes.map((box) => renderChartBox(box)).join('');

  return `
<h3>Family of ${block.fullNameHtml}</h3>

<div class="d-flex wt-chart-family-book">
    ${renderFamilyBookChildrenNode(block.childrenNode)}
    <div class="align-self-center">
        ${renderChartBox(block.individualBox)}${spousesHtml}
    </div>
    <div class="wt-chart-horizontal-spacer">
        <div class="wt-chart-horizontal-line"></div>
    </div>
    ${renderFamilyBookParentsNode(block.parentsNode)}
</div>`;
}

/**
 * The AJAX-loaded body: a flat, pre-order sequence of blocks (see this
 * file's own doc comment at the top), each separated by
 * `<hr class="wt-family-separator">` - mirrors chart.phtml's own
 * `<hr>` placed immediately before each recursive `chart.phtml` call,
 * which lands exactly once per block in the flattened array except the
 * very first (the root call itself has no `<hr>` before it).
 *
 * @param {Array<object>} blocks see buildFamilyBookBlocks() in
 *   index.mjs for the exact shape of each block
 * @returns {string}
 */
export function renderFamilyBookChart(blocks) {
  return blocks.map((block) => renderFamilyBookBlock(block)).join('\n<hr class="wt-family-separator">\n');
}

/**
 * Full page: /tree/{tree}/family-book-{book_size}-{generations}-{spouses}/{xref}.
 * Mirrors resources/views/modules/family-book-chart/page.phtml - same
 * shape as hourglass-chart-view.mjs's own renderHourglassChartPage()
 * (see that function's own doc comment for the dir="ltr" note, which
 * applies here unchanged), but with book_size as its own separate
 * numeric field (labeled "Generations" in real PHP) alongside
 * "generations" (labeled "Descendant generations").
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string, fullNameHtml: string}} params.individual
 * @param {number} params.bookSize
 * @param {number} params.minBookSize
 * @param {number} params.maxBookSize
 * @param {number} params.generations
 * @param {number} params.minGenerations
 * @param {number} params.maxGenerations
 * @param {boolean} params.spouses
 * @param {string} params.ajaxUrl
 * @returns {string}
 */
export function renderFamilyBookChartPage({
  tree,
  user,
  csrfToken,
  title,
  individual,
  bookSize,
  minBookSize,
  maxBookSize,
  generations,
  minGenerations,
  maxGenerations,
  spouses,
  ajaxUrl,
}) {
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
<body class="wt-global wt-theme-webtrees wt-route-family-book-chart-page">
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
                    <h2 class="wt-page-title">${title}</h2>

                    <form method="post" class="wt-page-options wt-page-options-family-book-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(individual.xref)}" required>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="book_size">Generations</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="book_size" name="book_size" type="number" min="${minBookSize}" max="${maxBookSize}" value="${bookSize}" required>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="generations">Descendant generations</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="generations" name="generations" type="number" min="${minGenerations}" max="${maxGenerations}" value="${generations}" required>
                            </div>
                        </div>
                        <fieldset class="row mb-3">
                            <legend class="col-form-label col-sm-3 wt-page-options-label">Spouses</legend>
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

                    <div class="wt-page-content wt-chart wt-chart-family-book" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
