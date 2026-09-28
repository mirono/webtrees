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
import { renderNotePage } from '../pages-server/note-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    note: {
      xref: 'N3',
      fullNameHtml: '<bdi>From Krzepice Book of Residents CRARG:</bdi>',
      text: 'From Krzepice Book of Residents CRARG:',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderNotePage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderNotePage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderNotePage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the derived title as the page heading', () => {
    const html = renderNotePage(baseParams());

    expect(html).toContain('<h2 class="wt-page-title"><bdi>From Krzepice Book of Residents CRARG:</bdi></h2>');
  });

  describe('the facts table', () => {
    test('always shows a "Shared note" row with the note\'s own text', () => {
      const html = renderNotePage(
        baseParams({ note: { ...baseParams().note, text: 'Line one\nLine two' } }),
      );

      expect(html).toContain('Shared note');
      expect(html).toContain('Line one<br>Line two');
    });

    test('renders CHAN with date and time in separate spans, and a bolded author line', () => {
      const html = renderNotePage(
        baseParams({
          note: {
            ...baseParams().note,
            facts: [{ tag: 'CHAN', value: '', date: 'June 1, 2018', time: '10:15:47', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('<span class="date">June 1, 2018</span> – <span class="date">10:15:47</span>');
      expect(html).toContain('<span class="label">Author of last change</span>: <span class="value align-top">miron</span>');
    });

    test('renders a fact\'s "other attributes" as their own label/value line', () => {
      const html = renderNotePage(
        baseParams({
          note: {
            ...baseParams().note,
            facts: [
              {
                tag: 'CHAN',
                value: '',
                date: '',
                time: '',
                author: '',
                otherAttributes: [{ label: 'NOTE:CHAN:_SOMETHING', value: 'x' }],
              },
            ],
          },
        }),
      );

      expect(html).toContain('<div><span class="label">NOTE:CHAN:_SOMETHING</span>: <span class="value align-top">x</span></div>');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderNotePage(
        baseParams({
          note: { ...baseParams().note, facts: [{ tag: 'CHAN', value: '', date: '1 JAN 2020', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-CHAN');
      expect(html).not.toContain('descriptionbox');
    });

    test('escapes the note text', () => {
      const html = renderNotePage(baseParams({ note: { ...baseParams().note, text: '<script>alert(1)</script>' } }));

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderNotePage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderNotePage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
