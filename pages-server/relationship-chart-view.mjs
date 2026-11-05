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

// View layer for /tree/{tree}/relationships-{ancestors}-{recursion}/{xref}{/xref2}
// (RelationshipsChartModule, phase 5 step 36). Mirrors
// RelationshipsChartModule::chart()'s own grid-building loop
// (app/Module/RelationshipsChartModule.php:~250-340) and
// resources/views/modules/relationships-chart/page.phtml. Always LTR
// (never real PHP's own RTL mirroring of the diagonal-line images) -
// the same already-established simplification as every other chart.
// Scope cut: the "Swap individuals" button's own small bit of client
// JS isn't ported (cosmetic convenience - swapping the two fields in
// the options form - not load-bearing for the chart itself).

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
  right: '<span class="wt-icon-arrow-right wt-icon-flip-rtl"><i class="fa-solid fa-arrow-right wt-icon-flip-rtl"></i></span>',
};

/**
 * One "spouse/sibling" connector cell - mirrors chart()'s own
 * `hus`/`wif`/`spo`/`bro`/`sis`/`sib` branch: a horizontal line with
 * the relationship label on top and a right-arrow below.
 */
function renderHorizontalConnector(label) {
  return (
    '<div style="background:url(/css/images/hline.png) repeat-x center; width: 94px; text-align: center">' +
    `<div style="height: 32px;">${escapeHtml(label)}</div>` +
    `<div style="height: 32px;">${ARROW_ICONS.right}</div>` +
    '</div>'
  );
}

/**
 * A straight vertical "parent"/"child" connector cell (no corner
 * turn) - mirrors chart()'s own vline.png branch.
 */
function renderVerticalConnector(label, arrowDirection) {
  return (
    '<div style="background:url(/css/images/vline.png) repeat-y center; height: 64px; text-align: center;">' +
    `<div style="display: inline-block; width:50%; line-height: 64px;">${escapeHtml(label)}</div>` +
    `<div style="display: inline-block; width:50%; line-height: 64px;">${ARROW_ICONS[arrowDirection]}</div>` +
    '</div>'
  );
}

/**
 * A diagonal "corner turn" connector cell, used when two consecutive
 * ancestor-then-descendant (or vice versa) steps would otherwise
 * double back on the same column - mirrors chart()'s own
 * dline.png/dline2.png branches.
 */
function renderDiagonalConnector(label, image, labelFirst) {
  const labelDiv = `<div style="height: 32px; text-align: ${labelFirst ? 'end' : 'start'};">${escapeHtml(label)}</div>`;
  const arrowDiv = `<div style="height: 32px; text-align: ${labelFirst ? 'start' : 'end'};">${ARROW_ICONS.down}</div>`;

  return (
    `<div style="background:url(${image}); width: 64px; height: 64px; text-align: center;">` +
    (labelFirst ? labelDiv + arrowDiv : arrowDiv + labelDiv) +
    '</div>'
  );
}

/**
 * Builds the full sparse (x,y) grid for one path - mirrors
 * `chart()`'s own loop EXACTLY: a child/descendant step moves the
 * cursor UP two rows (y -= 2) and a parent/ancestor step moves it
 * DOWN two rows (y += 2) - real PHP's own coordinate choice, not a
 * typo - with a diagonal connector instead of a straight vertical one
 * whenever the step reverses direction from the one two positions
 * earlier (an ancestor step right after a descendant step, or vice
 * versa).
 *
 * @param {string[]} path alternating individual/family xrefs
 * @param {string[]} codes one relationship code per family position (sparse, from relationshipCodesForPath())
 * @param {(index: number) => string} connectorLabel renders the label HTML for the family at this path index (already privacy-aware - callers pass in legacyNameAlgorithm()'s own result)
 * @param {(index: number) => string} individualBoxHtml renders the chart-box HTML for the individual at this path index
 * @returns {{cells: Map<string, string>, minY: number, maxY: number, maxX: number}}
 */
export function buildRelationshipGrid(path, codes, connectorLabel, individualBoxHtml) {
  const cells = new Map();
  let x = 0;
  let y = 0;
  let minY = 0;
  let maxY = 0;
  let maxX = 0;

  const set = (cx, cy, html) => cells.set(`${cx},${cy}`, html);

  for (let n = 0; n < path.length; n++) {
    if (n % 2 === 1) {
      const code = codes[n];
      const label = connectorLabel(n);

      if (code === 'hus' || code === 'wif' || code === 'spo' || code === 'bro' || code === 'sis' || code === 'sib') {
        set(x + 1, y, renderHorizontalConnector(label));
        x += 2;
      } else if (code === 'son' || code === 'dau' || code === 'chi') {
        if (n > 2 && /fat|mot|par/.test(codes[n - 2] ?? '')) {
          set(x + 1, y - 1, renderDiagonalConnector(label, '/css/images/dline2.png', false));
          x += 2;
        } else {
          set(x, y - 1, renderVerticalConnector(label, 'down'));
        }

        y -= 2;
      } else if (code === 'fat' || code === 'mot' || code === 'par') {
        if (n > 2 && /son|dau|chi/.test(codes[n - 2] ?? '')) {
          set(x + 1, y + 1, renderDiagonalConnector(label, '/css/images/dline.png', true));
          x += 2;
        } else {
          set(x, y + 1, renderVerticalConnector(label, 'up'));
        }

        y += 2;
      }

      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    } else {
      set(x, y, individualBoxHtml(n));
    }
  }

  return { cells, minY, maxY, maxX };
}

/**
 * Renders one path's own "Relationship: X" heading + grid table -
 * mirrors chart()'s own per-path echo block.
 *
 * @param {string} relationshipLabel already-computed via legacyNameAlgorithm()
 * @param {{cells: Map<string,string>, minY: number, maxY: number, maxX: number}} grid see buildRelationshipGrid()
 * @returns {string}
 */
export function renderRelationshipPath(relationshipLabel, grid) {
  const rows = [];

  for (let y = grid.maxY; y >= grid.minY; y--) {
    const cols = [];

    for (let x = 0; x <= grid.maxX; x++) {
      cols.push(`<td style="padding: 0;">${grid.cells.get(`${x},${y}`) ?? ''}</td>`);
    }

    rows.push(`<tr>${cols.join('')}</tr>`);
  }

  return (
    `<h3>Relationship: ${escapeHtml(relationshipLabel)}</h3>` +
    '<div class="wt-chart wt-chart-relationships">' +
    `<table style="border-collapse: collapse; margin: 20px 50px;">${rows.join('')}</table>` +
    '</div>'
  );
}

/**
 * The full ajax body: every found path's own heading + grid, or a
 * "no link found" message when there were none at all - mirrors
 * chart()'s own `if (!$num_paths)` fallback.
 *
 * @param {string[]} renderedPaths see renderRelationshipPath()
 * @returns {string}
 */
export function renderRelationshipsChart(renderedPaths) {
  if (renderedPaths.length === 0) {
    return '<p>No link between the two individuals could be found.</p>';
  }

  return renderedPaths.join('');
}

/**
 * Full page: /tree/{tree}/relationships-{ancestors}-{recursion}/{xref}{/xref2}.
 * Mirrors resources/views/modules/relationships-chart/page.phtml -
 * plain text inputs for both individuals (same simplification as
 * every other chart's own xref field), radio buttons for the
 * ancestors-only/recursion options (or a fixed hidden value when the
 * tree's own preference locks one of them), and an ajax-loaded
 * content div ONLY when both individuals are present (matching real
 * PHP exactly - a one-sided or empty selection shows the options form
 * alone, no spinner).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {string} params.xref1
 * @param {string} params.xref2
 * @param {number} params.ancestors
 * @param {boolean} params.ancestorsOnly
 * @param {number} params.recursion
 * @param {number} params.maxRecursion
 * @param {string} params.ajaxUrl empty string when there's no chart to show yet
 * @param {string} [params.genealogyMenuHtml]
 * @returns {string}
 */
export function renderRelationshipsChartPage({
  tree,
  user,
  csrfToken,
  title,
  xref1,
  xref2,
  ancestors,
  ancestorsOnly,
  recursion,
  maxRecursion,
  ajaxUrl,
  genealogyMenuHtml = '',
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

  const ancestorsFieldHtml = ancestorsOnly
    ? `<input type="hidden" name="ancestors" value="1">Find relationships via ancestors`
    : `<div class="form-check">
             <input class="form-check-input" type="radio" name="ancestors" id="ancestors0" value="0" ${ancestors === 0 ? 'checked' : ''}>
             <label class="form-check-label" for="ancestors0">Find any relationship</label>
         </div>
         <div class="form-check">
             <input class="form-check-input" type="radio" name="ancestors" id="ancestors1" value="1" ${ancestors === 1 ? 'checked' : ''}>
             <label class="form-check-label" for="ancestors1">Find relationships via ancestors</label>
         </div>`;

  const recursionFieldHtml =
    maxRecursion === 0
      ? `<input type="hidden" name="recursion" value="0">Find the closest relationships`
      : `<div class="form-check">
             <input class="form-check-input" type="radio" name="recursion" id="recursion0" value="0" ${recursion === 0 ? 'checked' : ''}>
             <label class="form-check-label" for="recursion0">Find the closest relationships</label>
         </div>
         <div class="form-check">
             <input class="form-check-input" type="radio" name="recursion" id="recursionMax" value="${maxRecursion}" ${recursion === maxRecursion ? 'checked' : ''}>
             <label class="form-check-label" for="recursionMax">${maxRecursion === 99 ? 'Find all possible relationships' : 'Find other relationships'}</label>
         </div>`;

  const chartDivHtml =
    ajaxUrl !== ''
      ? `<div class="wt-page-content wt-chart wt-chart-relationships" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>`
      : '';

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-relationships-chart-page">
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

                    <form method="post" class="wt-page-options wt-page-options-relationships-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual 1</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(xref1)}" required>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref2">Individual 2</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref2" id="xref2" value="${escapeHtml(xref2)}" required>
                            </div>
                        </div>
                        <fieldset class="row mb-3">
                            <legend class="col-form-label col-sm-3 wt-page-options-label"></legend>
                            <div class="col-sm-9 wt-page-options-value">${ancestorsFieldHtml}</div>
                        </fieldset>
                        <fieldset class="row mb-3">
                            <legend class="col-form-label col-sm-3 wt-page-options-label"></legend>
                            <div class="col-sm-9 wt-page-options-value">${recursionFieldHtml}</div>
                        </fieldset>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <button class="btn btn-primary" type="submit">view</button>
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    ${chartDivHtml}
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
