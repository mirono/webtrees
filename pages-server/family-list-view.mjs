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

// View layer for /tree/{tree}/family-list (FamilyListModule) - FULL
// FIDELITY, per explicit user decision over the "simple list" family's
// deliberate DataTables-to-plain-table simplification (repository/
// source/note/location-list-view.mjs). Both tables below are rendered
// with their REAL `datatables` class and `data-*` attributes, matching
// resources/views/lists/surnames-table.phtml and families-table.phtml
// exactly - the already-bundled webtrees.min.js DataTables init code
// (`document.querySelectorAll('table.datatables')...`, resources/js/webtrees/init.js)
// picks these up automatically, so no hand-rolled sort/search/filter JS
// is needed here, only matching markup.

import { familyListUrl } from './family-list.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Mirrors resources/views/lists/datatables-attributes.phtml - the
// shared DataTables i18n/layout config string every real DataTables
// table in this app carries. English-only text, matching this
// migration's established no-I18N convention for hand-rolled views.
const DATATABLES_ATTRIBUTES = `data-auto-width="false"
        data-language='{"paginate":{"first":"first","last":"last","next":"next","previous":"previous"},"emptyTable":"No records to display","info":"Showing _START_ to _END_ of _TOTAL_","infoEmpty":"Showing 0 to 0 of 0","infoFiltered":"(filtered from _MAX_ total entries)","lengthMenu":"Display _MENU_","loadingRecords":"Loading…","processing":"Calculating…","search":"Filter","zeroRecords":"No records to display"}'
        data-layout='{"topStart":"paging","topEnd":"search","bottomStart":"info","bottomEnd":"pageLength"}'
        data-length-menu='[[10,20,50,100,500,1000,-1],["10","20","50","100","500","1000","All"]]'
        data-state-save="true"`;

let idCounter = 0;

function nextId(prefix) {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/**
 * Mirrors resources/views/lists/surnames-table.phtml - a compact
 * 2-column surname summary (Surname / Spouses, each spelling variant
 * on its own line, linking to the full individuals list for that exact
 * spelling). `surnames` mirrors the PHP view's own `$surnames` param
 * shape EXACTLY: a Map keyed by canonical surname, whose value is a
 * Map of {spelling: count} - the SAME two Maps allSurnames() returns,
 * already filtered down by the caller's alpha/surname selection (same
 * contract as real PHP: the controller does the filtering, not this view).
 *
 * @param {object} params
 * @param {string} params.treeName
 * @param {Map<string, Map<string, number>>} params.surnames
 * @param {boolean} params.showFamilies true: "Spouses" column header; false: "Individuals"
 * @param {Record<string, string>} params.listParams extra query params
 *   every link carries (falpha/show_marnm/etc. - same as real PHP's own
 *   `$params` passed into `listUrl()`)
 * @returns {string}
 */
export function renderSurnamesTable({ treeName, surnames, showFamilies, listParams }) {
  const tableId = nextId('surnames-table-');
  const columnHeader = showFamilies ? 'Spouses' : 'Individuals';

  let n = 0;
  const rows = [...surnames.entries()]
    .map(([surn, spellings]) => {
      n += 1;

      const nameCells = [...spellings.keys()]
        .map((spelling) => {
          let label;

          if (spelling === '@N.N.') {
            label = '…';
          } else if (spelling === '') {
            label = escapeHtml(surn);
          } else {
            label = escapeHtml(spelling);
          }

          const url = familyListUrl(treeName, { ...listParams, surname: surn });

          return `<a href="${escapeHtml(url)}" class="ut">${label}</a><br>`;
        })
        .join('\n                        ');

      const total = [...spellings.values()].reduce((sum, count) => sum + count, 0);
      const countCells = [...spellings.values()]
        .map((count) => `${count}<br>`)
        .join('\n                        ');
      const totalCell = spellings.size > 1 ? total : '';

      return `
            <tr>
                <td data-sort="x${String(n).padStart(7, '0')}">
                    ${nameCells}
                </td>
                <td class="text-center" data-sort="${total}">
                    ${countCells}
                    ${totalCell}
                </td>
            </tr>`;
    })
    .join('');

  return `
    <table
        id="${tableId}"
        class="table table-bordered table-sm wt-table-surname datatables d-none"
        ${DATATABLES_ATTRIBUTES}
        data-info="false"
        data-paging="false"
        data-searching="false"
        data-order='[[0,"asc"]]'
    >
        <caption class="visually-hidden">Surnames</caption>
        <thead>
            <tr>
                <th>Surname</th>
                <th>${columnHeader}</th>
            </tr>
        </thead>
        <tbody>${rows}
        </tbody>
    </table>`;
}

/**
 * Mirrors resources/views/icons/sex.phtml exactly.
 *
 * @param {string} sexValue 'M'|'F'|'X'|'U'
 * @returns {string}
 */
function sexIconHtml(sexValue) {
  const iconByFontAwesome = {
    F: ['wt-icon-sex-f', 'fa-venus'],
    M: ['wt-icon-sex-m', 'fa-mars'],
    X: ['wt-icon-sex-x', 'fa-transgender'],
    U: ['wt-icon-sex-u', 'fa-genderless'],
  };

  const entry = iconByFontAwesome[sexValue];

  if (!entry) {
    return '';
  }

  const [cssClass, faIcon] = entry;

  return `<span class="wt-icon-sex ${cssClass}"><i class="fa-solid ${faIcon}"></i></span>`;
}

/**
 * Mirrors families-table.phtml's own husband/wife name-column
 * rendering (app/.../families-table.phtml:157-172): every one of the
 * spouse's own names EXCEPT a married (_MARNM) name that isn't also
 * the primary one, each on its own line, with the sex icon next to
 * the primary name.
 *
 * @param {object} params
 * @param {{allNames: {type: string, full: string}[], primaryIndex: number, sex: string, url: string}|null} params.spouse
 *   null when canShowNameOnly is false - rendered as the real PHP
 *   fallback Individual::new('H'/'W', ...) would (a blank/unknown name)
 * @returns {string}
 */
function spouseNameCellHtml(spouse) {
  if (spouse === null) {
    return '<div>…</div>';
  }

  return spouse.allNames
    .map((name, index) => {
      if (name.type === '_MARNM' && index !== spouse.primaryIndex) {
        return '';
      }

      const title = name.type === '_MARNM' ? ' title="Married name"' : '';
      const cssClass = index === spouse.primaryIndex ? '' : ' class="text-muted"';
      const sexIcon = index === spouse.primaryIndex ? `\n                            <small>${sexIconHtml(spouse.sex)}</small>` : '';

      return `
                        <div>
                            <a${title} href="${escapeHtml(spouse.url)}"${cssClass}>
                                ${name.full}
                            </a>${sexIcon}
                        </div>`;
    })
    .join('');
}

/**
 * Mirrors families-table.phtml's own age-at-event column
 * (`new Age(...)` - `ageYearsString()` for display, `ageDays()` for
 * `data-sort`).
 *
 * @param {import('../lib/age.js').Age|null} age null when the spouse
 *   itself is unresolvable (no birth date to compute from) - renders
 *   as an empty, zero-sorted cell, matching the real fallback
 *   Individual (no BIRT fact at all) PHP would compute the same empty
 *   age string from.
 * @returns {string}
 */
function ageCellHtml(age) {
  if (age === null) {
    return '<td class="text-center" data-sort="0"></td>';
  }

  return `<td class="text-center" data-sort="${age.ageDays()}">
                        ${escapeHtml(age.ageYearsString())}
                    </td>`;
}

/**
 * Mirrors resources/views/lists/families-table.phtml in full - the
 * real 14-column DataTables markup (filter buttons, hidden
 * marriage/alive-dead/roots-leaves filter-encoding columns,
 * toggle-parents footer), NOT the plain-table simplification every
 * prior list route used.
 *
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{
 *   xref: string, url: string, isPendingAddition: boolean, isPendingDeletion: boolean,
 *   husband: {allNames: object[], primaryIndex: number, sex: string, url: string, sortName: string, childFamiliesEmpty: boolean, spouseFamiliesCount: number, isDead: boolean}|null,
 *   wife: {allNames: object[], primaryIndex: number, sex: string, url: string, sortName: string, childFamiliesEmpty: boolean, spouseFamiliesCount: number, isDead: boolean}|null,
 *   husbandAge: import('../lib/age.js').Age|null,
 *   wifeAge: import('../lib/age.js').Age|null,
 *   anniversaryAge: import('../lib/age.js').Age|null,
 *   marriageDatesHtml: string[],
 *   marriageDateSortKey: string,
 *   marriageYesNo: 'yes'|'no'|null,
 *   marriagePlaces: string[],
 *   marriagePlaceSortKey: string,
 *   numberOfChildren: number,
 *   lastChange: {date: string, time: string}|null,
 *   marriageFilterCode: string,
 *   aliveDeadFilterCode: string,
 *   rootsLeavesFilterCode: string,
 * }[]} params.families
 * @param {boolean} params.showLastChange
 * @returns {string}
 */
export function renderFamiliesTable({ families, showLastChange }) {
  const tableId = nextId('families-table-');

  const rowsHtml = families
    .map((family) => {
      const rowClass = `${family.isPendingAddition ? 'wt-new' : ''} ${family.isPendingDeletion ? 'wt-old' : ''}`.trim();

      const husbandNameCell = `
                    <td colspan="2" data-sort="${escapeHtml(family.husband?.sortName ?? '')}">
                        ${spouseNameCellHtml(family.husband)}
                    </td>
                    <td hidden data-sort="${escapeHtml(family.husband?.sortName ?? '')}"></td>`;

      const wifeNameCell = `
                    <td colspan="2" data-sort="${escapeHtml(family.wife?.sortName ?? '')}">
                        ${spouseNameCellHtml(family.wife)}
                    </td>
                    <td hidden data-sort="${escapeHtml(family.wife?.sortName ?? '')}"></td>`;

      const marriageDateCell =
        family.marriageDatesHtml.length > 0
          ? family.marriageDatesHtml.map((d) => `<div>${d}</div>`).join('')
          : family.marriageYesNo === 'no'
            ? 'no'
            : family.marriageYesNo === 'yes'
              ? 'yes'
              : '';

      const marriagePlaceCell = family.marriagePlaces.map((p) => `<div>${escapeHtml(p)}</div>`).join('');

      const lastChangeCell = showLastChange
        ? `<td data-sort="x${String(family.lastChangeSortKey ?? 0).padStart(7, '0')}">

                        ${
                          family.lastChange === null
                            ? '<span class="wt-timestamp">Never</span>'
                            : `<span class="date">${escapeHtml(family.lastChange.date)}</span>${
                                family.lastChange.time ? ` – <span class="date">${escapeHtml(family.lastChange.time)}</span>` : ''
                              }`
                        }
                    </td>`
        : `<td hidden="hidden" data-sort="0"></td>`;

      return `
                <tr class="${rowClass}">
                    <!-- Husband name -->${husbandNameCell}
                    <!-- Husband age -->
                    ${ageCellHtml(family.husbandAge)}
                    <!-- Wife name -->${wifeNameCell}
                    <!-- Wife age -->
                    ${ageCellHtml(family.wifeAge)}
                    <!-- Marriage date -->
                    <td data-sort="x${String(family.marriageDateSortKey).padStart(7, '0')}">${marriageDateCell}</td>
                    <!-- Marriage anniversary -->
                    ${ageCellHtml(family.anniversaryAge)}
                    <!-- Marriage place -->
                    <td data-sort="${escapeHtml(family.marriagePlaceSortKey)}">${marriagePlaceCell}</td>
                    <!-- Number of children -->
                    <td class="text-center" data-sort="${family.numberOfChildren}">
                        ${family.numberOfChildren}
                    </td>
                    <!-- Last change -->
                    ${lastChangeCell}
                    <!-- Filter by marriage date -->
                    <td hidden="hidden">${family.marriageFilterCode}</td>
                    <!-- Filter by alive/dead -->
                    <td hidden="hidden">${family.aliveDeadFilterCode}</td>
                    <!-- Filter by roots/leaves -->
                    <td hidden="hidden">${family.rootsLeavesFilterCode}</td>
                </tr>`;
    })
    .join('');

  return `
    <div id="${tableId}-wrapper">
    <table class="table table-bordered table-sm wt-table-family datatables d-none"
        ${DATATABLES_ATTRIBUTES}
        data-columns='[{"type":"text"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"num"},{"visible":${showLastChange ? 'true' : 'false'}},{"sortable":false},{"sortable":false},{"sortable":false}]'
        data-sorting='[[1,"asc"]]'
    >
        <thead>
            <tr>
                <th colspan="14">
                    <div class="btn-toolbar d-flex justify-content-between mb-2">
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="N" autocomplete="off">
                            <label class="btn btn-outline-secondary btn-sm" title="Show individuals who are alive or couples where both partners are alive.">Both alive</label>
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="W" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples where only the female partner is dead.">Widower</label>
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="H" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples where only the male partner is dead.">Widow</label>
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="Y" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals who are dead or couples where both partners are dead.">Both dead</label>
                        </div>
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="13" data-filter-value="R" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show “roots” couples or individuals. These individuals may also be called “patriarchs”. They are individuals who have no parents recorded in the database.">Roots</label>
                            <input class="btn-check" type="checkbox" data-filter-column="13" data-filter-value="L" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show “leaves” couples or individuals. These are individuals who are alive but have no children recorded in the database.">Leaves</label>
                        </div>
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="11" data-filter-value="U" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples with an unknown marriage date.">Not married</label>
                            <input class="btn-check" type="checkbox" data-filter-column="11" data-filter-value="YES" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples who married more than 100 years ago.">Marriage&gt;100</label>
                            <input class="btn-check" type="checkbox" data-filter-column="11" data-filter-value="Y100" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples who married within the last 100 years.">Marriage&lt;=100</label>
                            <input class="btn-check" type="checkbox" data-filter-column="11" data-filter-value="D" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show divorced couples.">Divorce</label>
                            <input class="btn-check" type="checkbox" data-filter-column="11" data-filter-value="M" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show couples where either partner married more than once.">Multiple marriages</label>
                        </div>
                    </div>
                </th>
            </tr>
            <tr>
                <th>Given names</th>
                <th>Surname</th>
                <th>Age</th>
                <th>Given names</th>
                <th>Surname</th>
                <th>Age</th>
                <th>Marriage</th>
                <th title="Anniversary"><span class="wt-icon-anniversary"><i class="fa-solid fa-bell"></i></span></th>
                <th>Place</th>
                <th title="Children"><span class="wt-icon-children"><i class="fa-solid fa-children"></i></span></th>
                <th ${showLastChange ? '' : 'hidden="hidden"'}>Last change</th>
                <th hidden="hidden"></th>
                <th hidden="hidden"></th>
                <th hidden="hidden"></th>
            </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
        <tfoot>
            <tr>
                <th colspan="14">
                    <div class="btn-group btn-group-sm">
                        <input type="checkbox" class="btn-check" id="btn-toggle-parents" aria-expanded="false" autocomplete="off">
                        <label class="btn btn-secondary" for="btn-toggle-parents">Show parents</label>
                    </div>
                </th>
            </tr>
        </tfoot>
    </table>
    </div>`;
}
