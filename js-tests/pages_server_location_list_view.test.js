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
import { renderLocationListPage } from '../pages-server/location-list-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    title: 'Locations',
    locations: [],
    showLastChange: true,
    ...overrides,
  };
}

describe('renderLocationListPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderLocationListPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderLocationListPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the page title', () => {
    expect(renderLocationListPage(baseParams())).toContain('<h2 class="wt-page-title">Locations</h2>');
  });

  test('omits the table entirely when there are no locations', () => {
    expect(renderLocationListPage(baseParams())).not.toContain('<table');
  });

  test('renders one row per location with name link, both counts, and last change', () => {
    const html = renderLocationListPage(
      baseParams({
        locations: [
          {
            xref: 'L1',
            url: '/tree/ophir/location/L1',
            fullNameHtml: '<bdi>London</bdi>',
            individualCount: 3,
            familyCount: 1,
            lastChange: { date: 'December 30, 2017', time: '17:45:26' },
          },
        ],
      }),
    );

    expect(html).toContain('<a href="/tree/ophir/location/L1"><bdi>London</bdi></a>');
    expect(html).toContain('<td class="text-center">3</td>');
    expect(html).toContain('<td class="text-center">1</td>');
    expect(html).toContain('<span class="date">December 30, 2017</span> – <span class="date">17:45:26</span>');
  });

  test('a location with no CHAN fact shows "Never"', () => {
    const html = renderLocationListPage(
      baseParams({
        locations: [
          {
            xref: 'L2',
            url: '/tree/ophir/location/L2',
            fullNameHtml: '<bdi>L2</bdi>',
            individualCount: 0,
            familyCount: 0,
            lastChange: null,
          },
        ],
      }),
    );

    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('a date with no time omits the time span entirely', () => {
    const html = renderLocationListPage(
      baseParams({
        locations: [
          {
            xref: 'L2',
            url: '/tree/ophir/location/L2',
            fullNameHtml: '<bdi>L2</bdi>',
            individualCount: 0,
            familyCount: 0,
            lastChange: { date: 'December 30, 2017', time: '' },
          },
        ],
      }),
    );

    expect(html).toContain('<td><span class="date">December 30, 2017</span></td>');
  });

  test('escapes the page title', () => {
    expect(renderLocationListPage(baseParams({ title: '<script>alert(1)</script>' }))).toContain('&lt;script&gt;');
  });

  describe('column visibility, mirroring real PHP\'s locations-table.phtml data-columns config', () => {
    function zeroLocation(xref) {
      return {
        xref,
        url: `/tree/ophir/location/${xref}`,
        fullNameHtml: `<bdi>${xref}</bdi>`,
        individualCount: 0,
        familyCount: 0,
        lastChange: null,
      };
    }

    test('both count columns are omitted when every location has zero counts', () => {
      const html = renderLocationListPage(baseParams({ locations: [zeroLocation('L1')] }));

      expect(html).not.toContain('<th>Individuals</th>');
      expect(html).not.toContain('<th>Families</th>');
    });

    test('each count column is shown independently when at least one location has a nonzero value for it', () => {
      const html = renderLocationListPage(
        baseParams({
          locations: [{ ...zeroLocation('L1'), individualCount: 8 }],
        }),
      );

      expect(html).toContain('<th>Individuals</th>');
      expect(html).not.toContain('<th>Families</th>');
    });

    test('both columns shown when both have nonzero values somewhere', () => {
      const html = renderLocationListPage(
        baseParams({
          locations: [
            { ...zeroLocation('L1'), individualCount: 8 },
            { ...zeroLocation('L2'), familyCount: 3 },
          ],
        }),
      );

      expect(html).toContain('<th>Individuals</th>');
      expect(html).toContain('<th>Families</th>');
    });
  });
});
