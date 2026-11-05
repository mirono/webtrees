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
import { buildRelationshipGrid, renderRelationshipPath, renderRelationshipsChart, renderRelationshipsChartPage } from '../pages-server/relationship-chart-view.mjs';

describe('buildRelationshipGrid', () => {
  function box(xref) {
    return `<box ${xref}>`;
  }

  test('a single direct relationship (one family step) produces a 3-row, 1-column grid', () => {
    const path = ['I1', 'F1', 'I2'];
    const codes = [undefined, 'fat'];
    const grid = buildRelationshipGrid(path, codes, () => 'father', (n) => box(path[n]));

    expect(grid.maxX).toBe(0);
    expect(grid.minY).toBe(0);
    expect(grid.maxY).toBe(2);
    expect(grid.cells.get('0,0')).toBe(box('I1'));
    expect(grid.cells.get('0,2')).toBe(box('I2'));
    expect(grid.cells.get('0,1')).toContain('father');
  });

  test('a spouse/sibling step moves the cursor horizontally, not vertically', () => {
    const path = ['I1', 'F1', 'I2'];
    const codes = [undefined, 'wif'];
    const grid = buildRelationshipGrid(path, codes, () => 'wife', (n) => box(path[n]));

    expect(grid.minY).toBe(0);
    expect(grid.maxY).toBe(0);
    expect(grid.maxX).toBe(2);
    expect(grid.cells.get('1,0')).toContain('wife');
    expect(grid.cells.get('2,0')).toBe(box('I2'));
  });

  test('a corner turn (descendant step right after an ancestor step) uses a diagonal connector, advancing X', () => {
    // par (ancestor, y+=2) then son (descendant, right after - corner turn)
    const path = ['I1', 'F1', 'I2', 'F2', 'I3'];
    const codes = [undefined, 'fat', undefined, 'son'];
    const grid = buildRelationshipGrid(path, codes, () => 'label', (n) => box(path[n]));

    // After the 'fat' step: x=0,y=2. The 'son' step at n=3 checks codes[1]='fat' (matches /fat|mot|par/) -> diagonal, x+=2.
    expect(grid.maxX).toBe(2);
  });
});

describe('renderRelationshipPath', () => {
  test('renders the heading and a table with one row per grid Y level', () => {
    const grid = { cells: new Map([['0,0', '<box>']]), minY: 0, maxY: 0, maxX: 0 };
    const html = renderRelationshipPath('father', grid);

    expect(html).toContain('<h3>Relationship: father</h3>');
    expect(html).toContain('<box>');
    expect(html).toContain('wt-chart-relationships');
  });

  test('escapes the relationship label', () => {
    const grid = { cells: new Map(), minY: 0, maxY: 0, maxX: 0 };
    const html = renderRelationshipPath('<script>', grid);
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderRelationshipsChart', () => {
  test('joins every rendered path', () => {
    expect(renderRelationshipsChart(['<path-a>', '<path-b>'])).toBe('<path-a><path-b>');
  });

  test('shows the "no link found" message when there are zero paths', () => {
    expect(renderRelationshipsChart([])).toContain('No link between the two individuals could be found.');
  });
});

describe('renderRelationshipsChartPage', () => {
  function baseParams(overrides = {}) {
    return {
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Relationships',
      xref1: 'I1',
      xref2: 'I2',
      ancestors: 0,
      ancestorsOnly: false,
      recursion: 99,
      maxRecursion: 99,
      ajaxUrl: '/tree/ophir/relationships-0-99/I1/I2?ajax=1',
      ...overrides,
    };
  }

  test('renders both individual fields and a chart div when an ajaxUrl is given', () => {
    const html = renderRelationshipsChartPage(baseParams());

    expect(html).toContain('value="I1"');
    expect(html).toContain('value="I2"');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/relationships-0-99/I1/I2?ajax=1"');
  });

  test('renders no chart div at all when ajaxUrl is empty', () => {
    const html = renderRelationshipsChartPage(baseParams({ ajaxUrl: '' }));
    expect(html).not.toContain('data-wt-ajax-url');
  });

  test('a fixed ancestorsOnly preference shows a hidden field instead of radios', () => {
    const html = renderRelationshipsChartPage(baseParams({ ancestorsOnly: true }));
    expect(html).toContain('<input type="hidden" name="ancestors" value="1">');
    expect(html).not.toContain('id="ancestors0"');
  });

  test('maxRecursion=0 shows a hidden recursion field instead of radios', () => {
    const html = renderRelationshipsChartPage(baseParams({ maxRecursion: 0, recursion: 0 }));
    expect(html).toContain('<input type="hidden" name="recursion" value="0">');
  });

  test('a signed-in user gets a CSRF meta tag and hidden form field', () => {
    const html = renderRelationshipsChartPage(baseParams({ user: { realName: 'Jane Doe' }, csrfToken: 'abc123' }));
    expect(html).toContain('<meta name="csrf" content="abc123">');
    expect(html).toContain('<input type="hidden" name="csrf" value="abc123">');
  });

  test('splices in the genealogy menu when given one', () => {
    const html = renderRelationshipsChartPage(baseParams({ genealogyMenuHtml: '<nav class="wt-genealogy-menu-marker"></nav>' }));
    expect(html).toContain('wt-genealogy-menu-marker');
  });
});
