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

// View layer for /tree/{tree}/ancestors-{style}-{generations}/{xref}
// (AncestorsChartModule, phase 5 step 27) - the FIRST chart route.
// The "tree" style (resources/views/modules/ancestors-chart/tree.phtml)
// is a plain recursive, Bootstrap-collapsible HTML tree - no SVG/Canvas,
// no new JS needed (the existing bundled webtrees.min.js already
// handles both `data-bs-toggle="collapse"` via Bootstrap's own JS and
// `data-wt-ajax-url` auto-loading via init.js's own DOMContentLoaded
// hook - confirmed by reading that hook directly, already used
// elsewhere in this migration). The "individuals"/"families" styles
// reuse renderIndividualsTable()/renderFamiliesTable() unchanged - no
// new view code needed for those at all.

import { renderChartBox } from './chart-box-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors ancestors-chart/tree.phtml's own recursive structure exactly -
 * the individual's own box + Sosa number, then (if there's a resolved
 * parent family and generations remain) a collapsible "Parents —
 * <marriage summary> — N children" toggle, with each parent's own box
 * nested one level deeper, each recursing into ITS OWN parent family.
 *
 * @param {{
 *   box: object, sosa: number,
 *   parentFamily: {
 *     familyXref: string, marriageSummaryHtml: string, childCount: number,
 *     spouses: object[],
 *   } | null,
 * }} node see buildAncestorsNode() in index.mjs for the exact shape
 * @returns {string}
 */
export function renderAncestorsTreeNode(node) {
  const boxHtml = renderChartBox(node.box);

  const sosaHtml = `
    <div class="wt-sosa-number align-self-center p-1 mx-2 d-none d-md-block" title="Sosa-Stradonitz number">
        ${node.sosa}
    </div>`;

  let parentsHtml = '';

  if (node.parentFamily !== null) {
    const { familyXref, marriageSummaryHtml, childCount, spouses } = node.parentFamily;
    const childLabel = childCount === 1 ? '1 child' : `${childCount} children`;
    const toggleId = `fam-${escapeHtml(familyXref)}`;

    const spousesHtml = spouses
      .map(
        (spouseNode, index) => `
            <div class="d-flex">
                <div class="wt-chart-horizontal-indent position-relative">
                    ${
                      index === spouses.length - 1
                        ? '<div class="wt-chart-vertical-last-child-line position-absolute"></div>'
                        : '<div class="wt-chart-vertical-line position-absolute"></div><div class="wt-chart-vertical-child-line position-absolute"></div>'
                    }
                </div>
                <div>${renderAncestorsTreeNode(spouseNode)}</div>
            </div>`,
      )
      .join('');

    parentsHtml = `
    <div class="d-flex">
        <span class="wt-chart-horizontal-spacer d-inline-block"></span>
        <button class="btn btn-link px-0 py-1 wt-chart-expansion-control" data-bs-toggle="collapse" data-bs-target="#${toggleId}" aria-controls="${toggleId}" aria-expanded="true">
            Parents${marriageSummaryHtml !== '' ? ` — ${marriageSummaryHtml}` : ''} — ${childLabel}
        </button>
    </div>
    <div id="${toggleId}" class="collapse show mb-4">${spousesHtml}
    </div>`;
  }

  return `
<div class="d-flex">${boxHtml}${sosaHtml}
</div>${parentsHtml}`;
}

/**
 * Full page: /tree/{tree}/ancestors-tree-{generations}/{xref} (and the
 * individuals/families styles, which just embed the SAME ajax_url with
 * a different style segment - the client-side data-wt-ajax-url loader
 * doesn't care what HTML comes back). Mirrors
 * resources/views/modules/ancestors-chart/page.phtml - an options form
 * (individual/generations/layout-style) plus an ajax-loaded content div.
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string, fullNameHtml: string}} params.individual for the options form's current selection
 * @param {number} params.generations
 * @param {number} params.minGenerations
 * @param {number} params.maxGenerations
 * @param {string} params.style
 * @param {string} params.ajaxUrl
 * @returns {string}
 */
export function renderAncestorsChartPage({ tree, user, csrfToken, title, individual, generations, minGenerations, maxGenerations, style, ajaxUrl }) {
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
<body class="wt-global wt-theme-webtrees wt-route-ancestors-chart-page">
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

                    <form method="post" class="wt-page-options wt-page-options-ancestors-chart d-print-none">
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

                    <div class="wt-page-content wt-chart wt-chart-ancestors" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
