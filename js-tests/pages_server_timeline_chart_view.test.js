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
import { renderTimelineChart, renderTimelineChartPage } from '../pages-server/timeline-chart-view.mjs';

function box(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    fullNameHtml: '<span>John Smith</span>',
    alternateNameHtml: '',
    sex: 'M',
    ...overrides,
  };
}

function placedEvent(overrides = {}) {
  return {
    recordType: 'individual',
    ownerXref: 'I1',
    tag: 'BIRT',
    value: '',
    place: '',
    dateDisplay: '1 January 1900',
    colorIndex: 0,
    ownerFullNameHtml: '',
    ageHtml: '',
    family: null,
    xoffset: 22,
    yoffset: 0,
    tyoffset: 0,
    ...overrides,
  };
}

describe('renderTimelineChart', () => {
  test('renders the scale line and one box per event, with its label/date/place', () => {
    const html = renderTimelineChart({
      baseyear: 1895,
      topyear: 1905,
      scale: 10,
      bheight: 30,
      placedEvents: [placedEvent({ place: 'London, England' })],
      showNames: false,
    });

    expect(html).toContain('id="timeline_chart"');
    expect(html).toContain('Birth');
    expect(html).toContain('1 January 1900');
    expect(html).toContain('London, England');
    expect(html).not.toContain('<span>John Smith</span>'); // showNames=false, no name prefix
  });

  test('prefixes the owner name when showNames is true', () => {
    const html = renderTimelineChart({
      baseyear: 1895,
      topyear: 1905,
      scale: 10,
      bheight: 30,
      placedEvents: [placedEvent({ ownerFullNameHtml: '<span>John Smith</span>' })],
      showNames: true,
    });

    expect(html).toContain('<span>John Smith</span> —');
  });

  test('a family event shows its own label and any age spans', () => {
    const html = renderTimelineChart({
      baseyear: 1895,
      topyear: 1905,
      scale: 10,
      bheight: 30,
      placedEvents: [
        placedEvent({
          recordType: 'family',
          tag: 'MARR',
          ageHtml: '<span class="age"> Husband\'s age 27 years</span>',
          family: { url: '/tree/ophir/family/F1', fullNameHtml: 'John + Jane' },
        }),
      ],
      showNames: false,
    });

    expect(html).toContain('Marriage');
    expect(html).toContain("Husband's age 27 years");
    expect(html).toContain('/tree/ophir/family/F1');
  });

  test('an unrecognized tag falls back to the raw tag name', () => {
    const html = renderTimelineChart({
      baseyear: 1895,
      topyear: 1905,
      scale: 10,
      bheight: 30,
      placedEvents: [placedEvent({ tag: '_CUSTOM' })],
      showNames: false,
    });

    expect(html).toContain('_CUSTOM');
  });

  test('zero events still renders a valid (empty) chart', () => {
    const html = renderTimelineChart({ baseyear: 2000, topyear: 2010, scale: 10, bheight: 30, placedEvents: [], showNames: false });
    expect(html).toContain('id="timeline_chart"');
  });
});

describe('renderTimelineChartPage', () => {
  test('renders one card per selected individual with a remove link', () => {
    const html = renderTimelineChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Timeline',
      individuals: [{ box: box(), removeUrl: '/tree/ophir/timeline-10?xrefs%5B%5D=I2' }],
      resetUrl: '/tree/ophir/timeline-10',
      zoomInUrl: '/tree/ophir/timeline-15',
      zoomOutUrl: '/tree/ophir/timeline-5',
      ajaxUrl: '/tree/ophir/timeline-10?ajax=1',
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<span>John Smith</span>');
    expect(html).toContain('Remove individual');
    expect(html).toContain('/tree/ophir/timeline-10?xrefs%5B%5D=I2');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/timeline-10?ajax=1"');
  });

  test('a signed-in user gets a CSRF meta tag and hidden form field', () => {
    const html = renderTimelineChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: { realName: 'Jane Doe' },
      csrfToken: 'abc123',
      title: 'Timeline',
      individuals: [],
      resetUrl: '/tree/ophir/timeline-10',
      zoomInUrl: '/tree/ophir/timeline-15',
      zoomOutUrl: '/tree/ophir/timeline-5',
      ajaxUrl: '/tree/ophir/timeline-10?ajax=1',
    });

    expect(html).toContain('<meta name="csrf" content="abc123">');
    expect(html).toContain('<input type="hidden" name="csrf" value="abc123">');
  });

  test('splices in the genealogy menu when given one', () => {
    const html = renderTimelineChartPage({
      tree: { name: 'ophir', title: 'Ophir' },
      user: null,
      csrfToken: null,
      title: 'Timeline',
      individuals: [],
      resetUrl: '/tree/ophir/timeline-10',
      zoomInUrl: '/tree/ophir/timeline-15',
      zoomOutUrl: '/tree/ophir/timeline-5',
      ajaxUrl: '/tree/ophir/timeline-10?ajax=1',
      genealogyMenuHtml: '<nav class="wt-genealogy-menu-marker"></nav>',
    });

    expect(html).toContain('wt-genealogy-menu-marker');
  });
});
