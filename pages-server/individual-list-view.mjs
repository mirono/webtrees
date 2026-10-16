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

// View layer for /tree/{tree}/individual-list (IndividualListModule) -
// FULL FIDELITY, same decision as family-list-view.mjs: renders the
// REAL resources/views/lists/individuals-table.phtml markup (datatables
// class + data-columns/data-sorting, 3 filter-button groups - sex,
// alive/dead/birth/death-100-years, roots/leaves - hidden
// filter-encoding columns), not a simplified plain table. The
// `sosa`/Sosa-number column is ALWAYS hidden: AbstractIndividualListModule::handle()
// only ever calls this view with `sosa: false` (confirmed by reading
// the real source - sosa numbering is a DIFFERENT caller's feature,
// e.g. an ancestors chart, never reachable via this route) - rendered
// here as a permanently-hidden column for markup fidelity, with no
// supporting data/query logic at all.
//
// The page shell (surname-initials nav, given-name sublist,
// show/hide-married-names toggle) is fully shared with family-list -
// see family-list-view.mjs's renderFamilyListPage()/renderSurnamesTable(),
// both already generalized via a `routeSegment` parameter.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Mirrors resources/views/lists/datatables-attributes.phtml - see
// family-list-view.mjs's own copy of this same constant for why it's
// duplicated here rather than imported (small, per-file convention
// already established across this migration's view layer).
const DATATABLES_ATTRIBUTES = `data-auto-width="false"
        data-language='{"paginate":{"first":"first","last":"last","next":"next","previous":"previous"},"emptyTable":"No records to display","info":"Showing _START_ to _END_ of _TOTAL_","infoEmpty":"Showing 0 to 0 of 0","infoFiltered":"(filtered from _MAX_ total entries)","lengthMenu":"Display _MENU_","loadingRecords":"Loading…","processing":"Calculating…","search":"Filter","zeroRecords":"No records to display"}'
        data-layout='{"topStart":"paging","topEnd":"search","bottomStart":"info","bottomEnd":"pageLength"}'
        data-length-menu='[[10,20,50,100,500,1000,-1],["10","20","50","100","500","1000","All"]]'
        data-state-save="true"`;

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

function ageCellHtml(age) {
  if (age === null) {
    return '<td class="text-center" data-sort="0"></td>';
  }

  return `<td class="text-center" data-sort="${age.ageDays()}">
                        ${escapeHtml(age.ageYearsString())}
                    </td>`;
}

/**
 * Mirrors individuals-table.phtml's own name-column rendering
 * (lines 155-172 of the real file) - UNLIKE families-table.phtml's
 * husband/wife cell (family-list-view.mjs's spouseNameCellHtml()),
 * this shows EVERY one of the individual's own names, including every
 * married-name variant, with no _MARNM filtering at all - a real,
 * confirmed difference between the two templates, not an omission.
 */
function individualNameCellHtml(individual) {
  return individual.allNames
    .map((name, index) => {
      const title = name.type === '_MARNM' ? ' title="Married name"' : '';
      const cssClass = index === individual.primaryIndex ? '' : ' class="text-muted"';
      const sexIcon =
        index === individual.primaryIndex ? `\n                            <small>${sexIconHtml(individual.sex)}</small>` : '';

      return `
                        <div>
                            <a${title} href="${escapeHtml(individual.url)}"${cssClass}>
                                ${name.full}
                            </a>${sexIcon}
                        </div>`;
    })
    .join('');
}

/**
 * Mirrors resources/views/lists/individuals-table.phtml in full - the
 * real 16-column DataTables markup. `individuals` entries are fully
 * pre-resolved view models (privacy/data resolution is index.mjs's
 * job, same convention as every other view file in this migration).
 *
 * @param {object} params
 * @param {{
 *   xref: string, url: string, isPendingAddition: boolean, isPendingDeletion: boolean,
 *   allNames: object[], primaryIndex: number, sex: string, sortName: string,
 *   birthDatesHtml: string[], birthDateSortKey: number,
 *   birthAnniversaryAge: import('../lib/age.js').Age|null,
 *   birthPlaces: string[], birthPlaceSortKey: string,
 *   numberOfChildren: number,
 *   deathDatesHtml: string[], deathDateSortKey: number,
 *   deathAnniversaryAge: import('../lib/age.js').Age|null,
 *   ageAtDeath: import('../lib/age.js').Age|null,
 *   deathPlaces: string[], deathPlaceSortKey: string,
 *   lastChange: {date: string, time: string}|null, lastChangeSortKey: number,
 *   sexFilterCode: string, birthFilterCode: string, deathFilterCode: string,
 *   rootsLeavesFilterCode: string,
 * }[]} params.individuals
 * @param {boolean} params.showLastChange
 * @returns {string}
 */
export function renderIndividualsTable({ individuals, showLastChange }) {
  const rowsHtml = individuals
    .map((individual) => {
      const rowClass = `${individual.isPendingAddition ? 'wt-new' : ''} ${individual.isPendingDeletion ? 'wt-old' : ''}`.trim();

      const birthDateCell =
        individual.birthDatesHtml.length > 0 ? individual.birthDatesHtml.map((d) => `<div>${d}</div>`).join('') : '';
      const birthPlaceCell = individual.birthPlaces.map((p) => `<div>${escapeHtml(p)}</div>`).join('');
      const deathDateCell =
        individual.deathDatesHtml.length > 0 ? individual.deathDatesHtml.map((d) => `<div>${d}</div>`).join('') : '';
      const deathPlaceCell = individual.deathPlaces.map((p) => `<div>${escapeHtml(p)}</div>`).join('');

      const lastChangeCell = showLastChange
        ? `<td data-sort="x${String(individual.lastChangeSortKey ?? 0).padStart(7, '0')}">
                        ${
                          individual.lastChange === null
                            ? '<span class="wt-timestamp">Never</span>'
                            : `<span class="date">${escapeHtml(individual.lastChange.date)}</span>${
                                individual.lastChange.time
                                  ? ` – <span class="date">${escapeHtml(individual.lastChange.time)}</span>`
                                  : ''
                              }`
                        }
                    </td>`
        : `<td hidden="hidden" data-sort="0"></td>`;

      return `
                <tr class="${rowClass}">
                    <!-- Name -->
                    <td colspan="2" data-sort="${escapeHtml(individual.sortName)}">
                        ${individualNameCellHtml(individual)}
                    </td>
                    <td hidden data-sort="${escapeHtml(individual.sortName)}"></td>
                    <!-- Sosa (always hidden - never reachable via this route) -->
                    <td hidden="hidden" class="text-center" data-sort="0"></td>
                    <!-- Birth date -->
                    <td data-sort="x${String(individual.birthDateSortKey).padStart(7, '0')}">${birthDateCell}</td>
                    <!-- Birth anniversary -->
                    ${ageCellHtml(individual.birthAnniversaryAge)}
                    <!-- Birth place -->
                    <td data-sort="${escapeHtml(individual.birthPlaceSortKey)}">${birthPlaceCell}</td>
                    <!-- Number of children -->
                    <td class="text-center" data-sort="${individual.numberOfChildren}">
                        ${individual.numberOfChildren}
                    </td>
                    <!-- Death date -->
                    <td data-sort="x${String(individual.deathDateSortKey).padStart(7, '0')}">${deathDateCell}</td>
                    <!-- Death anniversary -->
                    ${ageCellHtml(individual.deathAnniversaryAge)}
                    <!-- Age at death -->
                    ${ageCellHtml(individual.ageAtDeath)}
                    <!-- Death place -->
                    <td data-sort="${escapeHtml(individual.deathPlaceSortKey)}">${deathPlaceCell}</td>
                    <!-- Last change -->
                    ${lastChangeCell}
                    <!-- Filter by sex -->
                    <td hidden="hidden">${individual.sexFilterCode}</td>
                    <!-- Filter by birthdate -->
                    <td hidden="hidden">${individual.birthFilterCode}</td>
                    <!-- Filter by deathdate -->
                    <td hidden="hidden">${individual.deathFilterCode}</td>
                    <!-- Filter by roots/leaves -->
                    <td hidden="hidden">${individual.rootsLeavesFilterCode}</td>
                </tr>`;
    })
    .join('');

  return `
    <div>
    <table class="table table-bordered table-sm wt-table-individual datatables d-none"
        ${DATATABLES_ATTRIBUTES}
        data-columns='[{"type":"text"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"num"},{"type":"text"},{"type":"num"},{"type":"num"},{"type":"text"},{"type":"text"},{"sortable":false},{"sortable":false},{"sortable":false},{"sortable":false}]'
        data-sorting='[[1,"asc"]]'
    >
        <thead>
            <tr>
                <th colspan="16">
                    <div class="btn-toolbar d-flex justify-content-between mb-2" role="toolbar">
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="M" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show only males.">${sexIconHtml('M')}</label>
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="F" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show only females.">${sexIconHtml('F')}</label>
                            <input class="btn-check" type="checkbox" data-filter-column="12" data-filter-value="U" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show only individuals for whom the sex is not known.">${sexIconHtml('U')}</label>
                        </div>
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="14" data-filter-value="N" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals who are alive or couples where both partners are alive.">Alive</label>
                            <input class="btn-check" type="checkbox" data-filter-column="14" data-filter-value="Y" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals who are dead or couples where both partners are dead.">Dead</label>
                            <input class="btn-check" type="checkbox" data-filter-column="14" data-filter-value="YES" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals who died more than 100 years ago.">Death&gt;100</label>
                            <input class="btn-check" type="checkbox" data-filter-column="14" data-filter-value="Y100" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals who died within the last 100 years.">Death&lt;=100</label>
                        </div>
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="13" data-filter-value="YES" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals born more than 100 years ago.">Birth&gt;100</label>
                            <input class="btn-check" type="checkbox" data-filter-column="13" data-filter-value="Y100" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show individuals born within the last 100 years.">Birth&lt;=100</label>
                        </div>
                        <div class="btn-group btn-group-sm" role="group">
                            <input class="btn-check" type="checkbox" data-filter-column="15" data-filter-value="R" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show “roots” couples or individuals. These individuals may also be called “patriarchs”. They are individuals who have no parents recorded in the database.">Roots</label>
                            <input class="btn-check" type="checkbox" data-filter-column="15" data-filter-value="L" autocomplete="off">
                            <label class="btn btn-outline-secondary" title="Show “leaves” couples or individuals. These are individuals who are alive but have no children recorded in the database.">Leaves</label>
                        </div>
                    </div>
                </th>
            </tr>
            <tr>
                <th>Given names</th>
                <th>Surname</th>
                <th hidden="hidden">Sosa</th>
                <th>Birth</th>
                <th title="Anniversary"><span class="wt-icon-anniversary"><i class="fa-solid fa-bell"></i></span></th>
                <th>Place</th>
                <th title="Children"><span class="wt-icon-children"><i class="fa-solid fa-children"></i></span></th>
                <th>Death</th>
                <th title="Anniversary"><span class="wt-icon-anniversary"><i class="fa-solid fa-bell"></i></span></th>
                <th>Age</th>
                <th>Place</th>
                <th ${showLastChange ? '' : 'hidden="hidden"'}>Last change</th>
                <th hidden="hidden"></th>
                <th hidden="hidden"></th>
                <th hidden="hidden"></th>
                <th hidden="hidden"></th>
            </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
        <tfoot>
            <tr>
                <th colspan="16">
                    <div class="btn-group btn-group-sm">
                        <input type="checkbox" class="btn-check" id="btn-toggle-parents" autocomplete="off">
                        <label class="btn btn-secondary" for="btn-toggle-parents">Show parents</label>
                    </div>
                </th>
            </tr>
        </tfoot>
    </table>
    </div>`;
}
