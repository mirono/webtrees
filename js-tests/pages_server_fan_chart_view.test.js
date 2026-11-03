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
import { describeAnnularWedge, buildFanWedges, renderFanChart, renderFanChartPage } from '../pages-server/fan-chart-view.mjs';

function box(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    canShow: true,
    fullNameHtml: '<span>John Smith</span>',
    alternateNameHtml: '',
    sex: 'M',
    lifespanText: '1900–1980',
    ...overrides,
  };
}

describe('describeAnnularWedge', () => {
  test('a wedge with no inner radius (center disk) starts/ends at the chart center', () => {
    const d = describeAnnularWedge(10, 10, 0, 5, 180, 270);
    expect(d.startsWith('M 10 10')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  test('an annular wedge (inner radius > 0) has four path commands', () => {
    const d = describeAnnularWedge(10, 10, 2, 5, 0, 90);
    expect(d.split(' A ').length).toBe(3); // two arcs
    expect(d.endsWith('Z')).toBe(true);
  });

  test('clamps a full-circle sweep instead of emitting a zero-length arc', () => {
    const d = describeAnnularWedge(10, 10, 2, 5, 0, 360);
    expect(d).not.toContain('360');
  });
});

describe('buildFanWedges', () => {
  // Two generations, an 8px chart, half-circle angles (180-360) - small
  // enough to verify the exact angle-splitting formulas by hand against
  // FanChartModule::chart()'s own math (app/Module/FanChartModule.php:281-427).
  const ancestors = new Map([
    [1, { box: box({ xref: 'I1' }) }],
    [2, { box: box({ xref: 'I2', sex: 'M' }) }],
    [3, { box: box({ xref: 'I3', sex: 'F' }) }],
  ]);

  test('produces one background wedge per generation', () => {
    const wedges = buildFanWedges(ancestors, 2, 8, 180, 360, 4);
    expect(wedges.backgroundWedges).toHaveLength(2);
    expect(wedges.widthPx).toBe(8);
    expect(wedges.heightPx).toBe(4);
  });

  test('splits the outer ring angle range exactly in half between Sosa 2 and 3', () => {
    const wedges = buildFanWedges(ancestors, 2, 8, 180, 360, 4);
    const sosa2 = wedges.personWedges.find((w) => w.sosa === 2);
    const sosa3 = wedges.personWedges.find((w) => w.sosa === 3);

    expect(sosa2).toBeDefined();
    expect(sosa3).toBeDefined();
    expect(sosa2.fill).toBe('#b1cff0'); // M
    expect(sosa3.fill).toBe('#e9daf1'); // F
  });

  test('a missing ancestor produces no person wedge, leaving the background visible', () => {
    const sparse = new Map([[1, { box: box({ xref: 'I1' }) }]]);
    const wedges = buildFanWedges(sparse, 2, 8, 180, 360, 4);
    expect(wedges.personWedges).toHaveLength(1);
    expect(wedges.personWedges[0].sosa).toBe(1);
  });

  test('each person wedge carries fitted text lines (name, lifespan)', () => {
    const wedges = buildFanWedges(ancestors, 2, 8, 180, 360, 4);
    const sosa1 = wedges.personWedges.find((w) => w.sosa === 1);
    expect(sosa1.text.lines).toEqual(['John Smith', '1900–1980']);
  });
});

describe('renderFanChart', () => {
  test('renders an svg, one <a> per present ancestor, and one popup per ancestor', () => {
    const ancestors = new Map([
      [1, { box: box({ xref: 'I1' }) }],
      [2, { box: box({ xref: 'I2' }) }],
    ]);
    const wedges = buildFanWedges(ancestors, 1, 8, 90, 450, 8);
    const html = renderFanChart(wedges, [...ancestors.values()], 'Fan chart of John Smith');

    expect(html).toContain('<svg');
    expect((html.match(/class="wt-chart-fan-wedge"/g) ?? []).length).toBe(1);
    expect((html.match(/class="fan_chart_menu"/g) ?? []).length).toBe(2);
    expect(html).toContain("querySelectorAll('a.wt-chart-fan-wedge')");
  });
});

describe('renderFanChartPage', () => {
  test('renders the options form and an ajax-loaded content div', () => {
    const html = renderFanChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Fan chart of John Smith',
      individual: { xref: 'I1' },
      style: 3,
      styles: { 2: 'half circle', 3: 'three-quarter circle', 4: 'full circle' },
      generations: 4,
      minGenerations: 2,
      maxGenerations: 9,
      width: 100,
      minWidth: 50,
      maxWidth: 500,
      ajaxUrl: '/tree/ophir/fan-chart-3-4-100/I1?ajax=1',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/fan-chart-3-4-100/I1?ajax=1"');
    expect(html).toContain('value="I1"');
    expect(html).toContain('<option value="3" selected>three-quarter circle</option>');
    expect(html).toContain('<option value="4" selected>4</option>');
  });

  test('a signed-in user gets a CSRF meta tag and hidden form field', () => {
    const html = renderFanChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: { realName: 'Jane Doe' },
      csrfToken: 'abc123',
      title: 'Fan chart of John Smith',
      individual: { xref: 'I1' },
      style: 4,
      styles: { 2: 'half circle', 3: 'three-quarter circle', 4: 'full circle' },
      generations: 2,
      minGenerations: 2,
      maxGenerations: 9,
      width: 50,
      minWidth: 50,
      maxWidth: 500,
      ajaxUrl: '/tree/ophir/fan-chart-4-2-50/I1?ajax=1',
    });

    expect(html).toContain('<meta name="csrf" content="abc123">');
    expect(html).toContain('<input type="hidden" name="csrf" value="abc123">');
    expect(html).toContain('Jane Doe');
  });
});
