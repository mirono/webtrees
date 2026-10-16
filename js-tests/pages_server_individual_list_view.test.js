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

import { describe, expect, test } from 'vitest';
import { renderIndividualsTable } from '../pages-server/individual-list-view.mjs';

function baseIndividual(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    isPendingAddition: false,
    isPendingDeletion: false,
    allNames: [{ type: 'NAME', full: '<span>John Smith</span>' }],
    primaryIndex: 0,
    sex: 'M',
    sortName: 'SMITH,JOHN',
    birthDatesHtml: [],
    birthDateSortKey: 0,
    birthAnniversaryAge: null,
    birthPlaces: [],
    birthPlaceSortKey: '',
    numberOfChildren: 0,
    deathDatesHtml: [],
    deathDateSortKey: 0,
    deathAnniversaryAge: null,
    ageAtDeath: null,
    deathPlaces: [],
    deathPlaceSortKey: '',
    lastChange: null,
    lastChangeSortKey: 0,
    sexFilterCode: 'M',
    birthFilterCode: 'YES',
    deathFilterCode: 'N',
    rootsLeavesFilterCode: '',
    ...overrides,
  };
}

describe('renderIndividualsTable', () => {
  test('carries the real datatables class, data-columns (16 entries), and the 4 filter button groups', () => {
    const html = renderIndividualsTable({ individuals: [], showLastChange: true });

    expect(html).toContain('class="table table-bordered table-sm wt-table-individual datatables d-none"');
    const columns = JSON.parse(html.match(/data-columns='(\[.*?\])'/)[1]);
    expect(columns).toHaveLength(16);
    expect(html).toContain('data-filter-column="12"');
    expect(html).toContain('data-filter-column="13"');
    expect(html).toContain('data-filter-column="14"');
    expect(html).toContain('data-filter-column="15"');
  });

  test('the Sosa column header is always hidden - this route never sets sosa=true', () => {
    const html = renderIndividualsTable({ individuals: [], showLastChange: true });
    expect(html).toContain('<th hidden="hidden">Sosa</th>');
  });

  test('shows EVERY name including married-name variants, unlike families-table\'s husband/wife cell', () => {
    const individual = baseIndividual({
      allNames: [
        { type: 'NAME', full: '<span>Jane Smith</span>' },
        { type: '_MARNM', full: '<span>Jane Doe</span>' },
      ],
      primaryIndex: 0,
    });

    const html = renderIndividualsTable({ individuals: [individual], showLastChange: true });
    expect(html).toContain('Jane Smith');
    expect(html).toContain('Jane Doe');
  });

  test('a married name carries the "Married name" title attribute', () => {
    const individual = baseIndividual({ allNames: [{ type: '_MARNM', full: '<span>Jane Doe</span>' }], primaryIndex: 0 });
    expect(renderIndividualsTable({ individuals: [individual], showLastChange: true })).toContain('title="Married name"');
  });

  test('the sex icon appears only next to the primary name', () => {
    const individual = baseIndividual({
      allNames: [
        { type: 'NAME', full: '<span>A</span>' },
        { type: 'NAME', full: '<span>B</span>' },
      ],
      primaryIndex: 1,
      sex: 'F',
    });
    const html = renderIndividualsTable({ individuals: [individual], showLastChange: true });
    const rowHtml = html.slice(html.indexOf('<tbody>'));
    expect(rowHtml.match(/wt-icon-sex-f/g)).toHaveLength(1);
  });

  test('"Never" is shown for an individual with no CHAN fact', () => {
    const html = renderIndividualsTable({ individuals: [baseIndividual({ lastChange: null })], showLastChange: true });
    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('Last change column is marked invisible via data-columns and hidden when showLastChange is false', () => {
    const html = renderIndividualsTable({ individuals: [], showLastChange: false });
    expect(html).toContain('<th hidden="hidden">Last change</th>');
  });

  test('pending-addition/deletion rows carry wt-new/wt-old classes', () => {
    const added = renderIndividualsTable({ individuals: [baseIndividual({ isPendingAddition: true })], showLastChange: true });
    const deleted = renderIndividualsTable({ individuals: [baseIndividual({ isPendingDeletion: true })], showLastChange: true });
    expect(added).toContain('<tr class="wt-new">');
    expect(deleted).toContain('<tr class="wt-old">');
  });

  test('hidden filter-encoding columns carry the exact codes the caller computed', () => {
    const html = renderIndividualsTable({
      individuals: [baseIndividual({ sexFilterCode: 'F', birthFilterCode: 'Y100', deathFilterCode: 'YES', rootsLeavesFilterCode: 'L' })],
      showLastChange: true,
    });

    expect(html).toContain('<td hidden="hidden">F</td>');
    expect(html).toContain('<td hidden="hidden">Y100</td>');
    expect(html).toContain('<td hidden="hidden">YES</td>');
    expect(html).toContain('<td hidden="hidden">L</td>');
  });

  test('numberOfChildren renders the real count, not blank', () => {
    const html = renderIndividualsTable({ individuals: [baseIndividual({ numberOfChildren: 3 })], showLastChange: true });
    expect(html).toContain('data-sort="3"');
  });

  test('birth/death dates and places render each on their own line', () => {
    const individual = baseIndividual({
      birthDatesHtml: ['<span>1 JAN 1900</span>'],
      birthPlaces: ['London'],
      deathDatesHtml: ['<span>1 JAN 1980</span>'],
      deathPlaces: ['Paris'],
    });
    const html = renderIndividualsTable({ individuals: [individual], showLastChange: true });

    expect(html).toContain('<div><span>1 JAN 1900</span></div>');
    expect(html).toContain('<div>London</div>');
    expect(html).toContain('<div><span>1 JAN 1980</span></div>');
    expect(html).toContain('<div>Paris</div>');
  });
});
