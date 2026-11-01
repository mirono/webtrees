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
import { renderDescendancyTreeNode, renderDescendancyChartPage } from '../pages-server/descendancy-chart-view.mjs';

function baseBox(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    canShow: true,
    fullNameHtml: '<span>John Smith</span>',
    sex: 'M',
    lifespanText: '1900–1980',
    birthSummaryHtml: '',
    deathSummaryHtml: '',
    thumbnailUrl: null,
    ...overrides,
  };
}

describe('renderDescendancyTreeNode', () => {
  test('a leaf node (no families) shows its own box and d’Aboville number, no toggle', () => {
    const html = renderDescendancyTreeNode({ box: baseBox(), daboville: '1', families: [] });

    expect(html).toContain('John Smith');
    expect(html).toContain('d’Aboville number');
    expect(html).toContain('>\n        1\n');
  });

  test('a family shows the marriage-summary + child-count toggle and the spouse as a plain box', () => {
    const spouseBox = baseBox({ xref: 'I2', fullNameHtml: '<span>Jane Doe</span>', sex: 'F' });
    const node = {
      box: baseBox(),
      daboville: '1',
      families: [{ familyXref: 'F1', marriageSummaryHtml: 'Marriage 1920', childCount: 2, spouseBox, children: [] }],
    };
    const html = renderDescendancyTreeNode(node);

    expect(html).toContain('Marriage 1920 — 2 children');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('data-bs-target="#fam-F1"');
  });

  test('singular "1 child" wording, not "1 children"', () => {
    const node = { box: baseBox(), daboville: '1', families: [{ familyXref: 'F1', marriageSummaryHtml: '', childCount: 1, spouseBox: null, children: [] }] };
    expect(renderDescendancyTreeNode(node)).toContain('1 child');
    expect(renderDescendancyTreeNode(node)).not.toContain('1 children');
  });

  test('a null spouseBox renders the real empty-box placeholder (an unmarried-in partner, or privacy-hidden)', () => {
    const node = { box: baseBox(), daboville: '1', families: [{ familyXref: 'F1', marriageSummaryHtml: '', childCount: 0, spouseBox: null, children: [] }] };
    expect(renderDescendancyTreeNode(node)).toContain('<div class="wt-chart-box"></div>');
  });

  test('no marriage summary -> no leading " — " before the child count', () => {
    const node = { box: baseBox(), daboville: '1', families: [{ familyXref: 'F1', marriageSummaryHtml: '', childCount: 0, spouseBox: null, children: [] }] };
    expect(renderDescendancyTreeNode(node)).toContain('>\n            0 children\n');
  });

  test('children recurse with d’Aboville numbers, numbered sequentially across ALL families, not reset per family', () => {
    const child1 = { box: baseBox({ xref: 'I3', fullNameHtml: '<span>Child One</span>' }), daboville: '1.1', families: [] };
    const child2 = { box: baseBox({ xref: 'I4', fullNameHtml: '<span>Child Two</span>' }), daboville: '1.2', families: [] };
    const node = {
      box: baseBox(),
      daboville: '1',
      families: [
        { familyXref: 'F1', marriageSummaryHtml: '', childCount: 1, spouseBox: null, children: [child1] },
        { familyXref: 'F2', marriageSummaryHtml: '', childCount: 1, spouseBox: null, children: [child2] },
      ],
    };
    const html = renderDescendancyTreeNode(node);

    expect(html).toContain('Child One');
    expect(html).toContain('1.1');
    expect(html).toContain('Child Two');
    expect(html).toContain('1.2');
  });

  test('multiple families each get their own toggle block', () => {
    const node = {
      box: baseBox(),
      daboville: '1',
      families: [
        { familyXref: 'F1', marriageSummaryHtml: 'First marriage', childCount: 0, spouseBox: null, children: [] },
        { familyXref: 'F2', marriageSummaryHtml: 'Second marriage', childCount: 0, spouseBox: null, children: [] },
      ],
    };
    const html = renderDescendancyTreeNode(node);

    expect(html).toContain('First marriage');
    expect(html).toContain('Second marriage');
    expect(html).toContain('#fam-F1');
    expect(html).toContain('#fam-F2');
  });

  test('the last child gets the "last child" vertical line class, earlier ones get the plain line', () => {
    const child1 = { box: baseBox({ xref: 'I3' }), daboville: '1.1', families: [] };
    const child2 = { box: baseBox({ xref: 'I4' }), daboville: '1.2', families: [] };
    const node = { box: baseBox(), daboville: '1', families: [{ familyXref: 'F1', marriageSummaryHtml: '', childCount: 2, spouseBox: null, children: [child1, child2] }] };
    const html = renderDescendancyTreeNode(node);

    expect(html).toContain('wt-chart-vertical-line');
    expect(html).toContain('wt-chart-vertical-last-child-line');
  });
});

describe('renderDescendancyChartPage', () => {
  function baseParams(overrides = {}) {
    return {
      tree: { title: 'The Ophir Family Tree', name: 'ophir' },
      user: null,
      csrfToken: null,
      title: 'Descendants of John Smith',
      individual: { xref: 'I1', fullNameHtml: '<span>John Smith</span>' },
      generations: 3,
      minGenerations: 2,
      maxGenerations: 63,
      style: 'tree',
      ajaxUrl: '/tree/ophir/descendants-tree-3/I1?ajax=1',
      ...overrides,
    };
  }

  test('the <html> tag declares dir="ltr"', () => {
    expect(renderDescendancyChartPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the ajax-loading div carries the real ajax_url', () => {
    const html = renderDescendancyChartPage(baseParams());
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/descendants-tree-3/I1?ajax=1"');
  });

  test('the current style is marked checked among the 3 layout radios', () => {
    const html = renderDescendancyChartPage(baseParams({ style: 'families' }));
    expect(html).toMatch(/id="style-families" value="families" checked="checked"/);
  });
});
