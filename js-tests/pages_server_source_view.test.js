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
import { renderSourcePage } from '../pages-server/source-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    source: {
      xref: 'S1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">Census 1900</span>',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderSourcePage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderSourcePage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderSourcePage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the source title as the page heading', () => {
    const html = renderSourcePage(baseParams());

    expect(html).toContain('<h2 class="wt-page-title"><span class="NAME" dir="auto" translate="no">Census 1900</span></h2>');
  });

  describe('the facts table', () => {
    test('is omitted entirely when there are no facts', () => {
      expect(renderSourcePage(baseParams())).not.toContain('wt-facts-table');
    });

    test('renders TITL as its own fact row too, labeled "Title" (matches real PHP\'s record-page-details.phtml, which has no tag allowlist - TITL shows redundantly with the page heading)', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'TITL', value: 'Census 1900', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('Title');
      expect(html).toContain('<div class="wt-fact-value">Census 1900</div>');
    });

    // Regression test: an earlier draft omitted REPO entirely, reported
    // live as "not showing ... the Repository". Mirrors
    // XrefRepository::value() (app/Elements/AbstractXrefElement.php's
    // valueXrefLink()): a link to the repository's own page, not a
    // plain-text value div.
    test('renders REPO as a link to the repository, labeled "Repository"', () => {
      const html = renderSourcePage(
        baseParams({
          source: {
            ...baseParams().source,
            facts: [
              {
                tag: 'REPO',
                value: '',
                date: '',
                time: '',
                author: '',
                repoUrl: '/tree/ophir/repository/R3',
                repoNameHtml: '<span class="NAME" dir="auto" translate="no">Israel State Archives</span>',
              },
            ],
          },
        }),
      );

      expect(html).toContain('Repository');
      expect(html).toContain(
        '<div class="wt-fact-value"><a href="/tree/ophir/repository/R3"><span class="NAME" dir="auto" translate="no">Israel State Archives</span></a></div>',
      );
    });

    test('a REPO fact whose repository no longer exists (or isn\'t showable) renders no link, just the label', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'REPO', value: '', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('Repository');
      expect(html).not.toContain('<a href=');
    });

    // Regression test: a real, common case in the imported tree - a
    // TITL fact's _HEB Hebrew transliteration subtag wasn't rendered at
    // all, reported live as "not showing ... SOUR:TITL:_HEB: ...".
    test('renders a fact\'s "other attributes" (e.g. TITL\'s _HEB subtag) as their own label/value line', () => {
      const html = renderSourcePage(
        baseParams({
          source: {
            ...baseParams().source,
            facts: [
              {
                tag: 'TITL',
                value: 'Department Of Immigration',
                date: '',
                time: '',
                author: '',
                otherAttributes: [{ label: 'SOUR:TITL:_HEB', value: 'מחלקת ההגירה' }],
              },
            ],
          },
        }),
      );

      expect(html).toContain(
        '<div><span class="label">SOUR:TITL:_HEB</span>: <span class="value align-top">מחלקת ההגירה</span></div>',
      );
    });

    test('a fact with no "other attributes" renders no extra label/value lines', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'AUTH', value: 'J. Smith', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).not.toContain('<span class="label">SOUR:');
    });

    test('renders AUTH/PUBL/ABBR with a known label and plain-text value', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'AUTH', value: 'J. Smith', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('Author');
      expect(html).toContain('<div class="wt-fact-value">J. Smith</div>');
    });

    test('joins multi-line TEXT values (CONT continuations) with <br>', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'TEXT', value: 'line one\nline two', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('<div class="wt-fact-value">line one<br>line two</div>');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'AUTH', value: 'J. Smith', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-AUTH');
      expect(html).not.toContain('descriptionbox');
    });

    test('escapes value content', () => {
      const html = renderSourcePage(
        baseParams({
          source: { ...baseParams().source, facts: [{ tag: 'AUTH', value: '<script>alert(1)</script>', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('renders CHAN with date and time in separate spans, and a bolded author line', () => {
      const html = renderSourcePage(
        baseParams({
          source: {
            ...baseParams().source,
            facts: [{ tag: 'CHAN', value: '', date: 'November 9, 2018', time: '19:38:08', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('<span class="date">November 9, 2018</span> – <span class="date">19:38:08</span>');
      expect(html).toContain('<span class="label">Author of last change</span>: <span class="value align-top">miron</span>');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderSourcePage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderSourcePage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
