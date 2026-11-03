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
import { renderCompactTreeChart, renderCompactTreeChartPage } from '../pages-server/compact-tree-chart-view.mjs';

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

describe('renderCompactTreeChart', () => {
  test('a present subject (Sosa 1) renders its box and no link-less arrow', () => {
    const cells = [];
    cells[1] = { box: baseBox(), href: '/tree/ophir/compact/I1', title: 'Compact tree of John Smith' };
    const html = renderCompactTreeChart(cells);

    expect(html).toContain('John Smith');
  });

  test('a missing ancestor renders the dedicated empty placeholder, not chart-box.phtml\'s own', () => {
    const cells = [];
    cells[1] = { box: baseBox(), href: '/tree/ophir/compact/I1', title: 'Compact tree of John Smith' };
    const html = renderCompactTreeChart(cells);

    expect(html).toContain('<div class="h-100 wt-chart-box">&nbsp;</div>');
  });

  test('a present ancestor at an arrow position renders a real link with title', () => {
    const cells = [];
    cells[1] = { box: baseBox(), href: '/tree/ophir/compact/I1', title: 'Compact tree of John Smith' };
    cells[2] = { box: baseBox({ xref: 'I2' }), href: '/tree/ophir/compact/I2', title: 'Compact tree of Father' };
    const html = renderCompactTreeChart(cells);

    expect(html).toContain('<a href="/tree/ophir/compact/I2" title="Compact tree of Father">');
  });

  test('an absent arrow position renders the bare icon, no link', () => {
    const cells = [];
    cells[1] = { box: baseBox(), href: '/tree/ophir/compact/I1', title: 'Compact tree of John Smith' };
    const html = renderCompactTreeChart(cells);

    // Sosa 2 is absent: its arrow-left icon renders without an <a> wrapper.
    expect(html).not.toContain('Compact tree of Father');
  });

  test('renders the fixed 14-row table unconditionally, even with only Sosa 1 present', () => {
    const cells = [];
    cells[1] = { box: baseBox(), href: '/tree/ophir/compact/I1', title: 'Compact tree of John Smith' };
    const html = renderCompactTreeChart(cells);

    expect(html).toContain('wt-chart-compact-table');
    expect((html.match(/<tr>/g) ?? []).length).toBe(14);
  });
});

describe('renderCompactTreeChartPage', () => {
  const baseParams = {
    tree: { title: 'Ophir', name: 'ophir' },
    user: null,
    csrfToken: null,
    title: 'Compact tree of John Smith',
    individual: { xref: 'I1' },
    ajaxUrl: '/tree/ophir/compact/I1?ajax=1',
  };

  test('renders the options form with just an individual field, no generations/spouses', () => {
    const html = renderCompactTreeChartPage(baseParams);

    expect(html).toContain('name="xref"');
    expect(html).not.toContain('name="generations"');
    expect(html).not.toContain('name="spouses"');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/compact/I1?ajax=1"');
  });

  test('renders dir="ltr"', () => {
    expect(renderCompactTreeChartPage(baseParams)).toContain('<html dir="ltr" lang="en">');
  });
});
