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
import { renderSourceListPage } from '../pages-server/source-list-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    title: 'Sources',
    sources: [],
    showLastChange: true,
    ...overrides,
  };
}

describe('renderSourceListPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderSourceListPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderSourceListPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the page title', () => {
    expect(renderSourceListPage(baseParams())).toContain('<h2 class="wt-page-title">Sources</h2>');
  });

  test('omits the table entirely when there are no sources', () => {
    expect(renderSourceListPage(baseParams())).not.toContain('<table');
  });

  test('renders one row per source with title link, abbreviation/author/publication, all four counts, and last change', () => {
    const html = renderSourceListPage(
      baseParams({
        sources: [
          {
            xref: 'S1',
            url: '/tree/ophir/source/S1',
            fullNameHtml: '<span class="NAME" dir="auto" translate="no">Census 1900</span>',
            abbreviation: 'Census',
            author: 'J. Smith',
            publication: 'Somewhere',
            individualCount: 3,
            familyCount: 1,
            mediaCount: 2,
            noteCount: 4,
            lastChange: { date: 'December 30, 2017', time: '17:45:26' },
          },
        ],
      }),
    );

    expect(html).toContain('<a href="/tree/ophir/source/S1"><span class="NAME" dir="auto" translate="no">Census 1900</span></a>');
    expect(html).toContain('<td>Census</td>');
    expect(html).toContain('<td>J. Smith</td>');
    expect(html).toContain('<td>Somewhere</td>');
    expect(html).toContain('<td class="text-center">3</td>');
    expect(html).toContain('<td class="text-center">1</td>');
    expect(html).toContain('<td class="text-center">2</td>');
    expect(html).toContain('<td class="text-center">4</td>');
    expect(html).toContain('<span class="date">December 30, 2017</span> – <span class="date">17:45:26</span>');
  });

  test('a source with no CHAN fact shows "Never"', () => {
    const html = renderSourceListPage(
      baseParams({
        sources: [
          {
            xref: 'S2',
            url: '/tree/ophir/source/S2',
            fullNameHtml: '<bdi>S2</bdi>',
            abbreviation: '',
            author: '',
            publication: '',
            individualCount: 0,
            familyCount: 0,
            mediaCount: 0,
            noteCount: 0,
            lastChange: null,
          },
        ],
      }),
    );

    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('a date with no time omits the time span entirely', () => {
    const html = renderSourceListPage(
      baseParams({
        sources: [
          {
            xref: 'S2',
            url: '/tree/ophir/source/S2',
            fullNameHtml: '<bdi>S2</bdi>',
            abbreviation: '',
            author: '',
            publication: '',
            individualCount: 0,
            familyCount: 0,
            mediaCount: 0,
            noteCount: 0,
            lastChange: { date: 'December 30, 2017', time: '' },
          },
        ],
      }),
    );

    expect(html).toContain('<td><span class="date">December 30, 2017</span></td>');
  });

  test('escapes abbreviation/author/publication', () => {
    const html = renderSourceListPage(
      baseParams({
        sources: [
          {
            xref: 'S3',
            url: '/tree/ophir/source/S3',
            fullNameHtml: '<bdi>S3</bdi>',
            abbreviation: '<script>alert(1)</script>',
            author: '',
            publication: '',
            individualCount: 0,
            familyCount: 0,
            mediaCount: 0,
            noteCount: 0,
            lastChange: null,
          },
        ],
      }),
    );

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('escapes the page title', () => {
    expect(renderSourceListPage(baseParams({ title: '<script>alert(1)</script>' }))).toContain('&lt;script&gt;');
  });

  describe('column visibility, mirroring real PHP\'s sources-table.phtml data-columns config', () => {
    function zeroSource(xref) {
      return {
        xref,
        url: `/tree/ophir/source/${xref}`,
        fullNameHtml: `<bdi>${xref}</bdi>`,
        abbreviation: '',
        author: '',
        publication: '',
        individualCount: 0,
        familyCount: 0,
        mediaCount: 0,
        noteCount: 0,
        lastChange: null,
      };
    }

    test('every count column is omitted when every source has a zero count', () => {
      const html = renderSourceListPage(baseParams({ sources: [zeroSource('S1'), zeroSource('S2')] }));

      expect(html).not.toContain('<th>Individuals</th>');
      expect(html).not.toContain('<th>Families</th>');
      expect(html).not.toContain('<th>Media objects</th>');
      expect(html).not.toContain('<th>Shared notes</th>');
    });

    test('Abbreviation/Author/Publication stay visible even when every source has a zero count (real PHP never hides these)', () => {
      const html = renderSourceListPage(baseParams({ sources: [zeroSource('S1')] }));

      expect(html).toContain('<th>Abbreviation</th>');
      expect(html).toContain('<th>Author</th>');
      expect(html).toContain('<th>Publication</th>');
    });

    test('each count column is shown independently when at least one source has a nonzero value for it', () => {
      const html = renderSourceListPage(
        baseParams({
          sources: [{ ...zeroSource('S1'), individualCount: 1 }, zeroSource('S2')],
        }),
      );

      expect(html).toContain('<th>Individuals</th>');
      expect(html).not.toContain('<th>Families</th>');
      expect(html).not.toContain('<th>Media objects</th>');
      expect(html).not.toContain('<th>Shared notes</th>');
    });

    test('"Last change" is omitted entirely when showLastChange is false, even with real data', () => {
      const html = renderSourceListPage(
        baseParams({
          showLastChange: false,
          sources: [{ ...zeroSource('S1'), lastChange: { date: 'December 30, 2017', time: '17:45:26' } }],
        }),
      );

      expect(html).not.toContain('<th>Last change</th>');
      expect(html).not.toContain('December 30, 2017');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderSourceListPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderSourceListPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
