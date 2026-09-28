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
import { renderHeaderPage } from '../pages-server/header-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    header: {
      xref: 'HEAD',
      fullNameHtml: 'Header',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderHeaderPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderHeaderPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderHeaderPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the literal "Header" title (not derived from any fact)', () => {
    expect(renderHeaderPage(baseParams())).toContain('<h2 class="wt-page-title">Header</h2>');
  });

  describe('the facts table', () => {
    test('is omitted entirely when there are no facts', () => {
      expect(renderHeaderPage(baseParams())).not.toContain('wt-facts-table');
    });

    test('renders SOUR as a plain "Application ID" value, not a source-citation link', () => {
      const html = renderHeaderPage(
        baseParams({ header: { ...baseParams().header, facts: [{ tag: 'SOUR', value: 'webtrees', date: '', time: '', author: '' }] } }),
      );

      expect(html).toContain('Application ID');
      expect(html).toContain('<div class="wt-fact-value">webtrees</div>');
    });

    test('renders a top-level DATE fact (not a subordinate line) with its own date/time', () => {
      const html = renderHeaderPage(
        baseParams({
          header: { ...baseParams().header, facts: [{ tag: 'DATE', value: '', date: 'April 20, 2020', time: '10:17:01', author: '' }] },
        }),
      );

      expect(html).toContain('<span class="wt-fact-date-age"><span class="date">April 20, 2020</span> – <span class="date">10:17:01</span></span>');
    });

    test('renders SUBM as a link to the real submitter, when resolvable', () => {
      const html = renderHeaderPage(
        baseParams({
          header: {
            ...baseParams().header,
            facts: [
              {
                tag: 'SUBM',
                value: '',
                date: '',
                time: '',
                author: '',
                submUrl: '/tree/ophir/submitter/S1',
                submNameHtml: '<span class="NAME" dir="auto" translate="no">Miron Ophir</span>',
              },
            ],
          },
        }),
      );

      expect(html).toContain('Submitter');
      expect(html).toContain(
        '<div class="wt-fact-value"><a href="/tree/ophir/submitter/S1"><span class="NAME" dir="auto" translate="no">Miron Ophir</span></a></div>',
      );
    });

    test('a SUBM fact with no resolvable submitter (e.g. hidden) renders no value line', () => {
      const html = renderHeaderPage(
        baseParams({ header: { ...baseParams().header, facts: [{ tag: 'SUBM', value: '', date: '', time: '', author: '' }] } }),
      );

      expect(html).not.toContain('wt-fact-value');
    });

    test('renders a fact\'s "other attributes" as their own label/value line', () => {
      const html = renderHeaderPage(
        baseParams({
          header: {
            ...baseParams().header,
            facts: [
              {
                tag: 'GEDC',
                value: '',
                date: '',
                time: '',
                author: '',
                otherAttributes: [
                  { label: 'Version', value: '5.5.1' },
                  { label: 'Format', value: 'Lineage-Linked' },
                ],
              },
            ],
          },
        }),
      );

      expect(html).toContain('<div><span class="label">Version</span>: <span class="value align-top">5.5.1</span></div>');
      expect(html).toContain('<div><span class="label">Format</span>: <span class="value align-top">Lineage-Linked</span></div>');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderHeaderPage(
        baseParams({ header: { ...baseParams().header, facts: [{ tag: 'CHAR', value: 'UTF-8', date: '', time: '', author: '' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-CHAR');
      expect(html).not.toContain('descriptionbox');
    });

    test('escapes value content', () => {
      const html = renderHeaderPage(
        baseParams({
          header: { ...baseParams().header, facts: [{ tag: 'FILE', value: '<script>alert(1)</script>', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderHeaderPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderHeaderPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
