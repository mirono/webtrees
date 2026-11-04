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

// View layer for /tree/{tree}/descendants-{style}-{generations}/{xref}
// (DescendancyChartModule, phase 5 step 28) - the SECOND chart route,
// AncestorsChartModule's direct sibling (same page shell, same
// recursive-collapsible-HTML-tree shape, same chart-box reuse, no new
// JS needed - see ancestors-chart-view.mjs's own doc comment for why).
// Real differences from Ancestors, both reflected in the data shape
// below (resolved in index.mjs, not here): a descendancy node can have
// MULTIPLE families (every spouse this individual ever married, not
// just one parent family), each family shows its OTHER spouse as a
// plain terminal box (not recursed into their own descendants), and
// children are numbered with d'Aboville notation ("1.2.3") - a
// per-individual counter that continues sequentially ACROSS every one
// of that individual's own families, not reset per family.

import { renderChartBox } from './chart-box-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors descendancy_chart/tree.phtml's own recursive structure -
 * the individual's own box + d'Aboville number, then (generations
 * remaining) one collapsible "<marriage summary> - N children" block
 * PER spouse family, each showing that family's other spouse as a
 * plain box, then every child recursing one level deeper.
 *
 * @param {{
 *   box: object, daboville: string,
 *   families: {
 *     familyXref: string, marriageSummaryHtml: string, childCount: number,
 *     spouseBox: object|null, children: object[],
 *   }[],
 * }} node see buildDescendancyNode() in index.mjs for the exact shape
 * @returns {string}
 */
export function renderDescendancyTreeNode(node) {
  const boxHtml = renderChartBox(node.box);

  const dabovilleHtml = `
    <div class="wt-daboville-number align-self-center p-1 mx-2 d-none d-md-block" title="d’Aboville number">
        ${escapeHtml(node.daboville)}
    </div>`;

  const familiesHtml = node.families
    .map((family) => {
      const toggleId = `fam-${escapeHtml(family.familyXref)}`;
      const childLabel = family.childCount === 1 ? '1 child' : `${family.childCount} children`;

      const childrenHtml = family.children
        .map(
          (childNode, index) => `
            <div class="d-flex">
                <div class="wt-chart-horizontal-indent position-relative">
                    ${
                      index === family.children.length - 1
                        ? '<div class="wt-chart-vertical-last-child-line position-absolute"></div>'
                        : '<div class="wt-chart-vertical-line position-absolute"></div><div class="wt-chart-vertical-child-line position-absolute"></div>'
                    }
                </div>
                <div>${renderDescendancyTreeNode(childNode)}</div>
            </div>`,
        )
        .join('');

      return `
    <div class="d-flex">
        <button class="btn btn-link px-0 py-1 wt-chart-expansion-control" data-bs-toggle="collapse" data-bs-target="#${toggleId}" aria-controls="${toggleId}" aria-expanded="true">
            ${family.marriageSummaryHtml !== '' ? `${family.marriageSummaryHtml} — ` : ''}${childLabel}
        </button>
    </div>
    <div id="${toggleId}" class="collapse show mb-4">${renderChartBox(family.spouseBox)}${childrenHtml}
    </div>`;
    })
    .join('');

  return `
<div class="d-flex">${boxHtml}${dabovilleHtml}
</div>${familiesHtml}`;
}

/**
 * Full page: /tree/{tree}/descendants-tree-{generations}/{xref} (and
 * the individuals/families styles - same ajax_url, different style
 * segment). Mirrors resources/views/modules/descendancy_chart/page.phtml -
 * near-identical to ancestors-chart-view.mjs's own renderAncestorsChartPage(),
 * differing only in title/body-class/CSS-hook text.
 *
 * @param {object} params same shape as renderAncestorsChartPage()'s own params
 * @returns {string}
 */
export function renderDescendancyChartPage({ tree, user, csrfToken, title, individual, generations, minGenerations, maxGenerations, style, ajaxUrl , genealogyMenuHtml = '' }) {
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

  const styles = [
    ['tree', 'Tree'],
    ['individuals', 'Individuals'],
    ['families', 'Families'],
  ];
  const styleRadiosHtml = styles
    .map(
      ([value, label]) => `
                <div class="form-check form-check-inline">
                    <input type="radio" class="form-check-input" name="style" id="style-${value}" value="${value}"${value === style ? ' checked="checked"' : ''}>
                    <label class="form-check-label" for="style-${value}">${label}</label>
                </div>`,
    )
    .join('');

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-descendancy-chart-page">
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

                    <form method="post" class="wt-page-options wt-page-options-descendants-chart d-print-none">
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
                            <div class="col-sm-9 wt-page-options-value">${styleRadiosHtml}
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

                    <div class="wt-page-content wt-chart wt-chart-descendants" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
