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
import {
  renderFamilyBookParentsNode,
  renderFamilyBookChildrenNode,
  renderFamilyBookChart,
  renderFamilyBookChartPage,
} from '../pages-server/family-book-chart-view.mjs';

function baseBox(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    canShow: true,
    fullNameHtml: '<span>John Smith</span>',
    alternateNameHtml: '',
    sex: 'M',
    lifespanText: '1900–1980',
    birthSummaryHtml: '',
    deathSummaryHtml: '',
    thumbnailUrl: null,
    ...overrides,
  };
}

describe('renderFamilyBookParentsNode', () => {
  test('both sides shown, neither nested', () => {
    const node = {
      husband: { box: baseBox({ xref: 'I2', fullNameHtml: '<span>Father</span>' }), nested: null },
      wife: { box: baseBox({ xref: 'I3', fullNameHtml: '<span>Mother</span>', sex: 'F' }), nested: null },
    };
    const html = renderFamilyBookParentsNode(node);

    expect(html).toContain('Father');
    expect(html).toContain('Mother');
    expect(html).toContain('wt-chart-horizontal-first-parent');
    expect(html).toContain('wt-chart-horizontal-last-parent');
  });

  test('a missing side renders an empty placeholder box, not omitted', () => {
    const node = {
      husband: { box: null, nested: null },
      wife: { box: baseBox({ xref: 'I3' }), nested: null },
    };
    const html = renderFamilyBookParentsNode(node);

    expect(html).toContain('<div class="wt-chart-box"></div>');
  });

  test('nested recursion renders even when both sides are empty placeholders (no arrow, unlike Hourglass)', () => {
    const node = {
      husband: {
        box: null,
        nested: { husband: { box: null, nested: null }, wife: { box: null, nested: null } },
      },
      wife: { box: null, nested: null },
    };
    const html = renderFamilyBookParentsNode(node);

    expect(html).not.toContain('hourglass-arrow');
    const emptyBoxCount = html.split('<div class="wt-chart-box"></div>').length - 1;
    expect(emptyBoxCount).toBe(4);
  });
});

describe('renderFamilyBookChildrenNode', () => {
  test('a single child gets the horizontal-line class', () => {
    const items = [{ box: baseBox({ xref: 'I2' }), nested: null }];
    const html = renderFamilyBookChildrenNode(items);

    expect(html).toContain('wt-chart-horizontal-line');
    expect(html).not.toContain('wt-chart-horizontal-first-child');
  });

  test('first/middle/last classes for 3 children', () => {
    const items = [
      { box: baseBox({ xref: 'I2' }), nested: null },
      { box: baseBox({ xref: 'I3' }), nested: null },
      { box: baseBox({ xref: 'I4' }), nested: null },
    ];
    const html = renderFamilyBookChildrenNode(items);

    expect(html).toContain('wt-chart-horizontal-first-child');
    expect(html).toContain('wt-chart-horizontal-middle-child');
    expect(html).toContain('wt-chart-horizontal-last-child');
  });

  test('no children renders no trailing spacer', () => {
    expect(renderFamilyBookChildrenNode([])).not.toContain('wt-chart-horizontal-line');
  });

  test('nested grandchildren render recursively, no spouse boxes anywhere', () => {
    const items = [
      {
        box: baseBox({ xref: 'I2' }),
        nested: [{ box: baseBox({ xref: 'I5', fullNameHtml: '<span>Grandchild</span>' }), nested: null }],
      },
    ];
    const html = renderFamilyBookChildrenNode(items);

    expect(html).toContain('Grandchild');
  });
});

describe('renderFamilyBookChart', () => {
  test('a single block renders the "Family of" heading and no separator', () => {
    const blocks = [
      {
        fullNameHtml: '<span>John Smith</span>',
        individualBox: baseBox(),
        spouseBoxes: [],
        childrenNode: [],
        parentsNode: { husband: { box: null, nested: null }, wife: { box: null, nested: null } },
      },
    ];
    const html = renderFamilyBookChart(blocks);

    expect(html).toContain('Family of <span>John Smith</span>');
    expect(html).not.toContain('wt-family-separator');
  });

  test('multiple blocks are joined by wt-family-separator', () => {
    const block = {
      fullNameHtml: '<span>X</span>',
      individualBox: baseBox(),
      spouseBoxes: [],
      childrenNode: [],
      parentsNode: { husband: { box: null, nested: null }, wife: { box: null, nested: null } },
    };
    const html = renderFamilyBookChart([block, block]);
    const separatorCount = html.split('wt-family-separator').length - 1;

    expect(separatorCount).toBe(1);
  });

  test('spouse boxes render when present', () => {
    const blocks = [
      {
        fullNameHtml: '<span>X</span>',
        individualBox: baseBox(),
        spouseBoxes: [baseBox({ xref: 'I9', fullNameHtml: '<span>Spouse</span>', sex: 'F' })],
        childrenNode: [],
        parentsNode: { husband: { box: null, nested: null }, wife: { box: null, nested: null } },
      },
    ];
    const html = renderFamilyBookChart(blocks);

    expect(html).toContain('Spouse');
  });
});

describe('renderFamilyBookChartPage', () => {
  const baseParams = {
    tree: { title: 'Ophir', name: 'ophir' },
    user: null,
    csrfToken: null,
    title: 'Family book of John Smith',
    individual: { xref: 'I1', fullNameHtml: '<span>John Smith</span>' },
    bookSize: 3,
    minBookSize: 2,
    maxBookSize: 5,
    generations: 5,
    minGenerations: 2,
    maxGenerations: 63,
    spouses: false,
    ajaxUrl: '/tree/ophir/family-book-3-5-0/I1?ajax=1',
  };

  test('renders the options form with book_size, generations, and spouses fields', () => {
    const html = renderFamilyBookChartPage(baseParams);

    expect(html).toContain('name="book_size"');
    expect(html).toContain('name="generations"');
    expect(html).toContain('name="spouses"');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/family-book-3-5-0/I1?ajax=1"');
  });

  test('renders dir="ltr"', () => {
    expect(renderFamilyBookChartPage(baseParams)).toContain('<html dir="ltr" lang="en">');
  });

  test('the spouses checkbox reflects the current value', () => {
    const html = renderFamilyBookChartPage({ ...baseParams, spouses: true });

    expect(html).toContain('id="spouses" value="1" checked="checked"');
  });
});
