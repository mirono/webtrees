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
import { renderLifespansChart, renderLifespansChartPage } from '../pages-server/lifespans-chart-view.mjs';

function box(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    fullNameHtml: '<span>John Smith</span>',
    sex: 'M',
    lifespanText: '1900–1980',
    birthSummaryHtml: '<div>Born 1 Jan 1900</div>',
    deathSummaryHtml: '<div>Died 1 Jan 1980</div>',
    ...overrides,
  };
}

describe('renderLifespansChart', () => {
  test('renders a decade scale, one bar per lifespan, and a collapsible summary card', () => {
    const html = renderLifespansChart({
      subtitle: '1 individual',
      startYear: 1900,
      endYear: 1990,
      lifespans: [{ background: 'hsla(240, 100%, 40%, 0.25)', birthYear: 1900, deathYear: 1980, id: 'individual-I1', box: box(), row: 0 }],
      maxRows: 1,
    });

    expect(html).toContain('1 individual');
    expect((html.match(/wt-lifespans-decade/g) ?? []).length).toBe(9);
    expect(html).toContain('data-bs-target="#individual-I1"');
    expect(html).toContain('left:0px');
    expect(html).toContain('width:565px');
    expect(html).toContain('Born 1 Jan 1900');
    expect(html).toContain('Died 1 Jan 1980');
  });

  test('a lifespan with no birth/death summary gets no extra empty line', () => {
    const html = renderLifespansChart({
      subtitle: '1 individual',
      startYear: 1900,
      endYear: 1990,
      lifespans: [{ background: 'x', birthYear: 1900, deathYear: 1980, id: 'individual-I1', box: box({ birthSummaryHtml: '', deathSummaryHtml: '' }), row: 0 }],
      maxRows: 1,
    });

    expect(html).not.toContain('<div></div>');
  });

  test('zero lifespans renders an empty but valid chart', () => {
    const html = renderLifespansChart({ subtitle: '0 individuals', startYear: 2000, endYear: 2010, lifespans: [], maxRows: 0 });
    expect(html).toContain('0 individuals');
    expect(html).toContain('wt-lifespans-individuals');
  });
});

describe('renderLifespansChartPage', () => {
  test('carries the accumulated xrefs forward as hidden fields', () => {
    const html = renderLifespansChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Lifespans',
      xrefs: ['I1', 'I2'],
      resetUrl: '/tree/ophir/lifespans',
      ajaxUrl: '/tree/ophir/lifespans?ajax=1&xrefs=I1.I2',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<input name="xrefs[]" type="hidden" value="I1">');
    expect(html).toContain('<input name="xrefs[]" type="hidden" value="I2">');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/lifespans?ajax=1&amp;xrefs=I1.I2"');
    expect(html).toContain('href="/tree/ophir/lifespans"');
  });

  test('a signed-in user gets a CSRF meta tag and hidden form field', () => {
    const html = renderLifespansChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: { realName: 'Jane Doe' },
      csrfToken: 'abc123',
      title: 'Lifespans',
      xrefs: [],
      resetUrl: '/tree/ophir/lifespans',
      ajaxUrl: '/tree/ophir/lifespans?ajax=1&xrefs=',
    });

    expect(html).toContain('<meta name="csrf" content="abc123">');
    expect(html).toContain('<input type="hidden" name="csrf" value="abc123">');
    expect(html).toContain('Jane Doe');
  });

  test('splices in the genealogy menu when given one', () => {
    const html = renderLifespansChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Lifespans',
      xrefs: [],
      resetUrl: '/tree/ophir/lifespans',
      ajaxUrl: '/tree/ophir/lifespans?ajax=1&xrefs=',
      genealogyMenuHtml: '<nav class="wt-genealogy-menu-marker"></nav>',
    });

    expect(html).toContain('wt-genealogy-menu-marker');
  });
});
