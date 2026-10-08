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
import { renderNoteListPage } from '../pages-server/note-list-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    title: 'Notes',
    notes: [],
    showLastChange: true,
    ...overrides,
  };
}

describe('renderNoteListPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderNoteListPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderNoteListPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the page title', () => {
    expect(renderNoteListPage(baseParams())).toContain('<h2 class="wt-page-title">Notes</h2>');
  });

  test('omits the table entirely when there are no notes', () => {
    expect(renderNoteListPage(baseParams())).not.toContain('<table');
  });

  test('renders one row per note with title link, all four counts, and last change', () => {
    const html = renderNoteListPage(
      baseParams({
        notes: [
          {
            xref: 'N1',
            url: '/tree/ophir/note/N1',
            fullNameHtml: '<bdi>Family history notes</bdi>',
            individualCount: 3,
            familyCount: 1,
            mediaCount: 2,
            sourceCount: 4,
            lastChange: { date: 'December 30, 2017', time: '17:45:26' },
          },
        ],
      }),
    );

    expect(html).toContain('<a href="/tree/ophir/note/N1"><bdi>Family history notes</bdi></a>');
    expect(html).toContain('<td class="text-center">3</td>');
    expect(html).toContain('<td class="text-center">1</td>');
    expect(html).toContain('<td class="text-center">2</td>');
    expect(html).toContain('<td class="text-center">4</td>');
    expect(html).toContain('<span class="date">December 30, 2017</span> – <span class="date">17:45:26</span>');
  });

  test('a note with no CHAN fact shows "Never"', () => {
    const html = renderNoteListPage(
      baseParams({
        notes: [
          {
            xref: 'N2',
            url: '/tree/ophir/note/N2',
            fullNameHtml: '<bdi>N2</bdi>',
            individualCount: 0,
            familyCount: 0,
            mediaCount: 0,
            sourceCount: 0,
            lastChange: null,
          },
        ],
      }),
    );

    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('a date with no time omits the time span entirely', () => {
    const html = renderNoteListPage(
      baseParams({
        notes: [
          {
            xref: 'N2',
            url: '/tree/ophir/note/N2',
            fullNameHtml: '<bdi>N2</bdi>',
            individualCount: 0,
            familyCount: 0,
            mediaCount: 0,
            sourceCount: 0,
            lastChange: { date: 'December 30, 2017', time: '' },
          },
        ],
      }),
    );

    expect(html).toContain('<td><span class="date">December 30, 2017</span></td>');
  });

  test('escapes the page title', () => {
    expect(renderNoteListPage(baseParams({ title: '<script>alert(1)</script>' }))).toContain('&lt;script&gt;');
  });

  describe('column visibility, mirroring real PHP\'s notes-table.phtml data-columns config', () => {
    function zeroNote(xref) {
      return {
        xref,
        url: `/tree/ophir/note/${xref}`,
        fullNameHtml: `<bdi>${xref}</bdi>`,
        individualCount: 0,
        familyCount: 0,
        mediaCount: 0,
        sourceCount: 0,
        lastChange: null,
      };
    }

    test('every count column is omitted when every note has a zero count - this is the real bug the user found via screenshot comparison (only one real note, all counts but Individuals were 0)', () => {
      const html = renderNoteListPage(baseParams({ notes: [zeroNote('N1')] }));

      expect(html).not.toContain('<th>Individuals</th>');
      expect(html).not.toContain('<th>Families</th>');
      expect(html).not.toContain('<th>Media objects</th>');
      expect(html).not.toContain('<th>Sources</th>');
    });

    test('each count column is shown independently when at least one note has a nonzero value for it', () => {
      const html = renderNoteListPage(
        baseParams({
          notes: [{ ...zeroNote('N1'), individualCount: 8 }],
        }),
      );

      expect(html).toContain('<th>Individuals</th>');
      expect(html).toContain('<td class="text-center">8</td>');
      expect(html).not.toContain('<th>Families</th>');
      expect(html).not.toContain('<th>Media objects</th>');
      expect(html).not.toContain('<th>Sources</th>');
    });

    test('"Last change" is omitted entirely when showLastChange is false, even with real data', () => {
      const html = renderNoteListPage(
        baseParams({
          showLastChange: false,
          notes: [{ ...zeroNote('N1'), lastChange: { date: 'June 1, 2018', time: '10:15:47' } }],
        }),
      );

      expect(html).not.toContain('<th>Last change</th>');
      expect(html).not.toContain('June 1, 2018');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderNoteListPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderNoteListPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
