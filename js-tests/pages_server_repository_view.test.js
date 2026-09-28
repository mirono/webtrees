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
import { renderRepositoryPage } from '../pages-server/repository-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    repository: {
      xref: 'R1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">Israel State Archives</span>',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderRepositoryPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderRepositoryPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderRepositoryPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the repository name as the page heading', () => {
    const html = renderRepositoryPage(baseParams());

    expect(html).toContain('<h2 class="wt-page-title"><span class="NAME" dir="auto" translate="no">Israel State Archives</span></h2>');
  });

  describe('the facts table', () => {
    test('is omitted entirely when there are no facts', () => {
      expect(renderRepositoryPage(baseParams())).not.toContain('wt-facts-table');
    });

    test('renders NAME as its own fact row too, labeled "Name" (matches real PHP\'s record-page-details.phtml, which has no tag allowlist)', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: { ...baseParams().repository, facts: [{ tag: 'NAME', value: 'Israel State Archives', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('Name');
      expect(html).toContain('<div class="wt-fact-value">Israel State Archives</div>');
    });

    test('renders ADDR with a "wt-fact-value" line, joining CONT continuations with <br>', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: {
            ...baseParams().repository,
            facts: [{ tag: 'ADDR', value: '14 Hartom St.\nJerusalem', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).toContain('Address');
      expect(html).toContain('<div class="wt-fact-value">14 Hartom St.<br>Jerusalem</div>');
    });

    // Regression-guarding tests: EMAIL/WWW are the two Repository facts
    // real PHP renders as links (AddressEmail::value()/
    // AddressWebPage::value()), not plain text - everything else is bare.
    test('renders EMAIL as a mailto: link', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: { ...baseParams().repository, facts: [{ tag: 'EMAIL', value: 'info@example.com', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('Email address');
      expect(html).toContain('<a dir="ltr" href="mailto:info@example.com">info@example.com</a>');
    });

    test('renders WWW as an external link', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: { ...baseParams().repository, facts: [{ tag: 'WWW', value: 'https://example.com', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('URL');
      expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });

    test('renders PHON/FAX/REFN/RIN as plain text, with their real labels', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: {
            ...baseParams().repository,
            facts: [
              { tag: 'PHON', value: '02-5680680', date: '', time: '', author: '' },
              { tag: 'FAX', value: '02-1234567', date: '', time: '', author: '' },
              { tag: 'REFN', value: 'abc123', date: '', time: '', author: '' },
              { tag: 'RIN', value: 'xyz789', date: '', time: '', author: '' },
            ],
          },
        }),
      );

      expect(html).toContain('Phone');
      expect(html).toContain('<div class="wt-fact-value">02-5680680</div>');
      expect(html).toContain('Fax');
      expect(html).toContain('Reference number');
      expect(html).toContain('Record ID number');
    });

    test('renders a fact\'s "other attributes" as their own label/value line', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: {
            ...baseParams().repository,
            facts: [
              {
                tag: 'NAME',
                value: 'Israel State Archives',
                date: '',
                time: '',
                author: '',
                otherAttributes: [{ label: 'REPO:NAME:_HEB', value: 'ארכיון המדינה' }],
              },
            ],
          },
        }),
      );

      expect(html).toContain(
        '<div><span class="label">REPO:NAME:_HEB</span>: <span class="value align-top">ארכיון המדינה</span></div>',
      );
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: { ...baseParams().repository, facts: [{ tag: 'PHON', value: '02-5680680', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-PHON');
      expect(html).not.toContain('descriptionbox');
    });

    test('escapes value content', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: {
            ...baseParams().repository,
            facts: [{ tag: 'NAME', value: '<script>alert(1)</script>', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('renders CHAN with date and time in separate spans, and a bolded author line', () => {
      const html = renderRepositoryPage(
        baseParams({
          repository: {
            ...baseParams().repository,
            facts: [{ tag: 'CHAN', value: '', date: 'December 30, 2017', time: '17:45:26', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('<span class="date">December 30, 2017</span> – <span class="date">17:45:26</span>');
      expect(html).toContain('<span class="label">Author of last change</span>: <span class="value align-top">miron</span>');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderRepositoryPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderRepositoryPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
