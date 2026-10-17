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

// Renders resources/views/chart-box.phtml - see chart-box.mjs's own
// doc comment for what's deliberately simplified away (dropdown
// menus, SHOW_PARENTS_AGE). Shared by every chart module.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {{
 *   xref: string, url: string, canShow: boolean, fullNameHtml: string,
 *   sex: string, lifespanText: string, birthSummaryHtml: string,
 *   deathSummaryHtml: string, thumbnailUrl: string|null,
 * }|null} box null renders an empty placeholder box, matching real
 *   PHP's own `if ($individual === null) { echo '<div class="wt-chart-box"></div>'; }`
 *   - used for a family with no resolvable husband/wife.
 * @returns {string}
 */
export function renderChartBox(box) {
  if (box === null) {
    return '<div class="wt-chart-box"></div>';
  }

  const nameHtml = box.canShow ? `<a href="${escapeHtml(box.url)}">${box.fullNameHtml}</a>` : box.fullNameHtml;

  const thumbnailHtml =
    box.thumbnailUrl !== null
      ? `
    <div class="wt-chart-box-thumbnail float-start me-1">
        <img class="wt-chart-box-thumbnail" src="${escapeHtml(box.thumbnailUrl)}" alt="">
    </div>`
      : '';

  const birthHtml = box.birthSummaryHtml !== '' ? `<div class="wt-chart-box-fact small">${box.birthSummaryHtml}</div>` : '';
  const deathHtml = box.deathSummaryHtml !== '' ? `<div class="wt-chart-box-fact small">${box.deathSummaryHtml}</div>` : '';

  return `
    <div class="wt-chart-box wt-chart-box-${escapeHtml(box.sex.toLowerCase())} overflow-hidden" data-wt-chart-xref="${escapeHtml(box.xref)}">${thumbnailHtml}
        <div class="wt-chart-box-name">${nameHtml}</div>
        <div class="wt-chart-box-lifespan">${escapeHtml(box.lifespanText)}</div>
        <div class="wt-chart-box-facts">${birthHtml}${deathHtml}
        </div>
    </div>`;
}
