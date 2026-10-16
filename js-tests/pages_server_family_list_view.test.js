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
import { renderSurnamesTable, renderFamiliesTable } from '../pages-server/family-list-view.mjs';

function baseFamily(overrides = {}) {
  return {
    xref: 'F1',
    url: '/tree/ophir/family/F1',
    isPendingAddition: false,
    isPendingDeletion: false,
    husband: null,
    wife: null,
    husbandAge: null,
    wifeAge: null,
    anniversaryAge: null,
    marriageDatesHtml: [],
    marriageDateSortKey: '0000000',
    marriageYesNo: null,
    marriagePlaces: [],
    marriagePlaceSortKey: '',
    numberOfChildren: 0,
    lastChange: null,
    lastChangeSortKey: 0,
    marriageFilterCode: '',
    aliveDeadFilterCode: '',
    rootsLeavesFilterCode: '',
    ...overrides,
  };
}

describe('renderSurnamesTable', () => {
  test('carries the real datatables class and data-* attributes, so bundled JS turns it into a DataTable', () => {
    const html = renderSurnamesTable({
      treeName: 'ophir',
      surnames: new Map([['SMITH', new Map([['Smith', 5]])]]),
      showFamilies: true,
      listParams: {},
    });

    expect(html).toContain('class="table table-bordered table-sm wt-table-surname datatables d-none"');
    expect(html).toContain('data-paging="false"');
    expect(html).toContain('data-searching="false"');
  });

  test('"Spouses" header for a family list, "Individuals" for an individual list', () => {
    const surnames = new Map([['SMITH', new Map([['Smith', 1]])]]);
    expect(renderSurnamesTable({ treeName: 'ophir', surnames, showFamilies: true, listParams: {} })).toContain('<th>Spouses</th>');
    expect(renderSurnamesTable({ treeName: 'ophir', surnames, showFamilies: false, listParams: {} })).toContain('<th>Individuals</th>');
  });

  test('each spelling variant links to the surname-filtered list, carrying extra listParams', () => {
    const surnames = new Map([['SMITH', new Map([['Smith', 3], ['SMYTHE', 2]])]]);
    const html = renderSurnamesTable({ treeName: 'ophir', surnames, showFamilies: true, listParams: { show_marnm: 'yes' } });

    expect(html).toContain('/tree/ophir/family-list?show_marnm=yes&amp;surname=SMITH');
    expect(html).toContain('>Smith<');
    expect(html).toContain('>SMYTHE<');
  });

  test('shows the total count only when there is more than one spelling variant', () => {
    const oneSpelling = renderSurnamesTable({
      treeName: 'ophir',
      surnames: new Map([['SMITH', new Map([['Smith', 5]])]]),
      showFamilies: true,
      listParams: {},
    });
    const twoSpellings = renderSurnamesTable({
      treeName: 'ophir',
      surnames: new Map([['SMITH', new Map([['Smith', 3], ['SMYTHE', 2]])]]),
      showFamilies: true,
      listParams: {},
    });

    expect(oneSpelling).not.toContain('>5<');
    expect(twoSpellings).toContain('data-sort="5"');
  });

  test('the NOMEN_NESCIO ("@N.N.") spelling renders as an ellipsis, not the raw sentinel', () => {
    const surnames = new Map([['@N.N.', new Map([['@N.N.', 1]])]]);
    const html = renderSurnamesTable({ treeName: 'ophir', surnames, showFamilies: true, listParams: {} });
    expect(html).not.toContain('@N.N.<');
    expect(html).toContain('>…<');
  });
});

describe('renderFamiliesTable', () => {
  test('carries the real datatables class, data-columns, and the 3 filter button groups', () => {
    const html = renderFamiliesTable({ families: [], showLastChange: true });

    expect(html).toContain('class="table table-bordered table-sm wt-table-family datatables d-none"');
    expect(html).toContain('data-filter-column="12"');
    expect(html).toContain('data-filter-column="13"');
    expect(html).toContain('data-filter-column="11"');
    expect(html).toContain('Show parents');
  });

  test('the Last change column is marked invisible via data-columns when showLastChange is false', () => {
    const html = renderFamiliesTable({ families: [], showLastChange: false });
    expect(html).toContain('{"visible":false}');
    expect(html).toContain('<th hidden="hidden">');
  });

  test('a husband with no resolvable name renders an ellipsis placeholder, not a crash', () => {
    const html = renderFamiliesTable({ families: [baseFamily({ husband: null })], showLastChange: true });
    expect(html).toContain('<div>…</div>');
  });

  test('a husband with multiple names shows every non-married name, each as its own line', () => {
    const family = baseFamily({
      husband: {
        allNames: [
          { type: 'NAME', full: '<span>John Smith</span>' },
          { type: 'NAME', full: '<span>Jonathan Smith</span>' },
        ],
        primaryIndex: 0,
        sex: 'M',
        url: '/tree/ophir/individual/I1',
        sortName: 'SMITH,JOHN',
      },
    });

    const html = renderFamiliesTable({ families: [family], showLastChange: true });
    expect(html).toContain('John Smith');
    expect(html).toContain('Jonathan Smith');
  });

  test('a married name is hidden unless it is also the primary name', () => {
    const notPrimary = baseFamily({
      wife: {
        allNames: [
          { type: 'NAME', full: '<span>Jane Smith</span>' },
          { type: '_MARNM', full: '<span>Jane Doe</span>' },
        ],
        primaryIndex: 0,
        sex: 'F',
        url: '/tree/ophir/individual/I2',
        sortName: 'SMITH,JANE',
      },
    });
    const isPrimary = baseFamily({
      wife: {
        allNames: [{ type: '_MARNM', full: '<span>Jane Doe</span>' }],
        primaryIndex: 0,
        sex: 'F',
        url: '/tree/ophir/individual/I2',
        sortName: 'DOE,JANE',
      },
    });

    expect(renderFamiliesTable({ families: [notPrimary], showLastChange: true })).not.toContain('Jane Doe');
    expect(renderFamiliesTable({ families: [isPrimary], showLastChange: true })).toContain('Jane Doe');
  });

  test('a married name shows the "Married name" title attribute', () => {
    const family = baseFamily({
      wife: {
        allNames: [{ type: '_MARNM', full: '<span>Jane Doe</span>' }],
        primaryIndex: 0,
        sex: 'F',
        url: '/tree/ophir/individual/I2',
        sortName: 'DOE,JANE',
      },
    });

    expect(renderFamiliesTable({ families: [family], showLastChange: true })).toContain('title="Married name"');
  });

  test('a family with no CHIL/NCHI facts shows "0" children, not blank', () => {
    const html = renderFamiliesTable({ families: [baseFamily({ numberOfChildren: 0 })], showLastChange: true });
    expect(html).toContain('>\n                        0\n');
  });

  test('marriageYesNo renders "yes"/"no" text when there are no actual dated marriage facts', () => {
    const withDates = renderFamiliesTable({ families: [baseFamily({ marriageDatesHtml: ['<span>12 JUN 1950</span>'] })], showLastChange: true });
    const noDateButMarried = renderFamiliesTable({ families: [baseFamily({ marriageYesNo: 'yes' })], showLastChange: true });
    const neverMarried = renderFamiliesTable({ families: [baseFamily({ marriageYesNo: 'no' })], showLastChange: true });

    expect(withDates).toContain('12 JUN 1950');
    expect(noDateButMarried).toContain('>yes<');
    expect(neverMarried).toContain('>no<');
  });

  test('"Never" is shown for a family with no CHAN fact, same as every other list route', () => {
    const html = renderFamiliesTable({ families: [baseFamily({ lastChange: null })], showLastChange: true });
    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('pending-addition/deletion rows carry wt-new/wt-old classes', () => {
    const added = renderFamiliesTable({ families: [baseFamily({ isPendingAddition: true })], showLastChange: true });
    const deleted = renderFamiliesTable({ families: [baseFamily({ isPendingDeletion: true })], showLastChange: true });

    expect(added).toContain('<tr class="wt-new">');
    expect(deleted).toContain('<tr class="wt-old">');
  });

  test('hidden filter-encoding columns carry the exact codes the caller computed', () => {
    const html = renderFamiliesTable({
      families: [baseFamily({ marriageFilterCode: 'Y100D', aliveDeadFilterCode: 'Y', rootsLeavesFilterCode: 'R' })],
      showLastChange: true,
    });

    expect(html).toContain('<td hidden="hidden">Y100D</td>');
    expect(html).toContain('<td hidden="hidden">Y</td>');
    expect(html).toContain('<td hidden="hidden">R</td>');
  });
});
