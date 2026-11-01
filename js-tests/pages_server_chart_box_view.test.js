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
import { renderChartBox } from '../pages-server/chart-box-view.mjs';

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

describe('renderChartBox', () => {
  test('null renders the real empty-box placeholder exactly', () => {
    expect(renderChartBox(null)).toBe('<div class="wt-chart-box"></div>');
  });

  test('a showable individual gets a real link around their name', () => {
    const html = renderChartBox(baseBox());
    expect(html).toContain('<a href="/tree/ophir/individual/I1"><span>John Smith</span></a>');
  });

  test('a non-showable individual (Private) has no link', () => {
    const html = renderChartBox(baseBox({ canShow: false, fullNameHtml: 'Private' }));
    expect(html).not.toContain('<a href');
    expect(html).toContain('Private');
  });

  test('sex drives the box CSS class, lowercased', () => {
    expect(renderChartBox(baseBox({ sex: 'F' }))).toContain('wt-chart-box-f');
    expect(renderChartBox(baseBox({ sex: 'U' }))).toContain('wt-chart-box-u');
  });

  test('no thumbnail markup at all when thumbnailUrl is null', () => {
    expect(renderChartBox(baseBox({ thumbnailUrl: null }))).not.toContain('<img');
  });

  test('a real thumbnail <img> when thumbnailUrl is set', () => {
    const html = renderChartBox(baseBox({ thumbnailUrl: '/tree/ophir/media-thumbnail?s=abc' }));
    expect(html).toContain('<img class="wt-chart-box-thumbnail" src="/tree/ophir/media-thumbnail?s=abc" alt="">');
  });

  test('the wt-chart-box-fact wrapper is always present, even with no facts (matches real PHP - never conditional)', () => {
    const html = renderChartBox(baseBox());
    expect(html).toContain('<div class="wt-chart-box-fact small"></div>');
  });

  test('birth/death fact summaries are concatenated INSIDE the same single wt-chart-box-fact wrapper', () => {
    const html = renderChartBox(baseBox({ birthSummaryHtml: '<div class="fact_BIRT">born text</div>', deathSummaryHtml: '<div class="fact_DEAT">died text</div>' }));

    expect(html).toContain('<div class="wt-chart-box-fact small"><div class="fact_BIRT">born text</div><div class="fact_DEAT">died text</div></div>');
    expect(html.match(/wt-chart-box-fact small/g)).toHaveLength(1);
  });

  test('the alternate-name row is always rendered, raw (pre-escaped) HTML, empty when there is no alternate name', () => {
    const html = renderChartBox(baseBox({ alternateNameHtml: '' }));
    expect(html).toContain('<div class="wt-chart-box-name wt-chart-box-name-alt"></div>');
  });

  test('a real alternate name (e.g. Hebrew) renders in its own row', () => {
    const html = renderChartBox(baseBox({ alternateNameHtml: '<span dir="auto">משה כנרי</span>' }));
    expect(html).toContain('<div class="wt-chart-box-name wt-chart-box-name-alt"><span dir="auto">משה כנרי</span></div>');
  });

  test('the lifespan text is escaped', () => {
    expect(renderChartBox(baseBox({ lifespanText: '<script>' }))).not.toContain('<script>');
  });
});
