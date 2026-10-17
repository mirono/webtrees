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
import { renderAncestorsTreeNode, renderAncestorsChartPage } from '../pages-server/ancestors-chart-view.mjs';

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

describe('renderAncestorsTreeNode', () => {
  test('a leaf node (no parent family) shows its own box and Sosa number, no toggle', () => {
    const html = renderAncestorsTreeNode({ box: baseBox(), sosa: 1, parentFamily: null });

    expect(html).toContain('John Smith');
    expect(html).toContain('Sosa-Stradonitz number');
    expect(html).toContain('>\n        1\n');
    expect(html).not.toContain('Parents');
  });

  test('a node with a parent family shows the Parents toggle, marriage summary, and child count', () => {
    const node = {
      box: baseBox(),
      sosa: 1,
      parentFamily: { familyXref: 'F1', marriageSummaryHtml: 'Marriage — 1 Jan 1925', childCount: 3, spouses: [] },
    };
    const html = renderAncestorsTreeNode(node);

    expect(html).toContain('Parents — Marriage — 1 Jan 1925 — 3 children');
    expect(html).toContain('data-bs-target="#fam-F1"');
    expect(html).toContain('id="fam-F1"');
  });

  test('singular "1 child" wording, not "1 children"', () => {
    const node = { box: baseBox(), sosa: 1, parentFamily: { familyXref: 'F1', marriageSummaryHtml: '', childCount: 1, spouses: [] } };
    expect(renderAncestorsTreeNode(node)).toContain('1 child');
    expect(renderAncestorsTreeNode(node)).not.toContain('1 children');
  });

  test('no marriage summary -> no leading " — " before the child count', () => {
    const node = { box: baseBox(), sosa: 1, parentFamily: { familyXref: 'F1', marriageSummaryHtml: '', childCount: 0, spouses: [] } };
    expect(renderAncestorsTreeNode(node)).toContain('Parents — 0 children');
  });

  test('each spouse recurses into its own box, with the Sosa number doubled (+1 for the second spouse)', () => {
    const fatherBox = baseBox({ xref: 'I2', fullNameHtml: '<span>Robert Smith</span>' });
    const motherBox = baseBox({ xref: 'I3', fullNameHtml: '<span>Mary Jones</span>', sex: 'F' });
    const node = {
      box: baseBox(),
      sosa: 1,
      parentFamily: {
        familyXref: 'F1',
        marriageSummaryHtml: '',
        childCount: 1,
        spouses: [
          { box: fatherBox, sosa: 2, parentFamily: null },
          { box: motherBox, sosa: 3, parentFamily: null },
        ],
      },
    };
    const html = renderAncestorsTreeNode(node);

    expect(html).toContain('Robert Smith');
    expect(html).toContain('Mary Jones');
    expect(html.match(/>\s*2\s*</)).not.toBeNull();
    expect(html.match(/>\s*3\s*</)).not.toBeNull();
  });

  test('the last spouse gets the "last child" vertical line class, earlier ones get the plain line', () => {
    const node = {
      box: baseBox(),
      sosa: 1,
      parentFamily: {
        familyXref: 'F1',
        marriageSummaryHtml: '',
        childCount: 0,
        spouses: [
          { box: baseBox({ xref: 'I2' }), sosa: 2, parentFamily: null },
          { box: baseBox({ xref: 'I3' }), sosa: 3, parentFamily: null },
        ],
      },
    };
    const html = renderAncestorsTreeNode(node);

    expect(html).toContain('wt-chart-vertical-line');
    expect(html).toContain('wt-chart-vertical-last-child-line');
  });

  test('recurses arbitrarily deep (grandparents)', () => {
    const grandparentNode = { box: baseBox({ xref: 'I4', fullNameHtml: '<span>William Smith</span>' }), sosa: 4, parentFamily: null };
    const node = {
      box: baseBox(),
      sosa: 1,
      parentFamily: {
        familyXref: 'F1',
        marriageSummaryHtml: '',
        childCount: 1,
        spouses: [{ box: baseBox({ xref: 'I2' }), sosa: 2, parentFamily: { familyXref: 'F2', marriageSummaryHtml: '', childCount: 1, spouses: [grandparentNode] } }],
      },
    };

    expect(renderAncestorsTreeNode(node)).toContain('William Smith');
  });
});

describe('renderAncestorsChartPage', () => {
  function baseParams(overrides = {}) {
    return {
      tree: { title: 'The Ophir Family Tree', name: 'ophir' },
      user: null,
      csrfToken: null,
      title: 'Ancestors of John Smith',
      individual: { xref: 'I1', fullNameHtml: '<span>John Smith</span>' },
      generations: 4,
      minGenerations: 2,
      maxGenerations: 31,
      style: 'tree',
      ajaxUrl: '/tree/ophir/ancestors-tree-4/I1?ajax=1',
      ...overrides,
    };
  }

  test('the <html> tag declares dir="ltr"', () => {
    expect(renderAncestorsChartPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the ajax-loading div carries the real ajax_url', () => {
    const html = renderAncestorsChartPage(baseParams());
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/ancestors-tree-4/I1?ajax=1"');
  });

  test('the current style is marked checked among the 3 layout radios', () => {
    const html = renderAncestorsChartPage(baseParams({ style: 'individuals' }));
    expect(html).toMatch(/id="style-individuals" value="individuals" checked="checked"/);
    expect(html).not.toMatch(/id="style-tree" value="tree" checked="checked"/);
  });

  test('generations value and min/max are reflected in the number input', () => {
    const html = renderAncestorsChartPage(baseParams({ generations: 6, minGenerations: 2, maxGenerations: 31 }));
    expect(html).toContain('min="2" max="31" value="6"');
  });
});
