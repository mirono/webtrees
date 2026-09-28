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
import { renderSubmitterPage } from '../pages-server/submitter-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    submitter: {
      xref: 'S1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">Miron Ophir</span>',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderSubmitterPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderSubmitterPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderSubmitterPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the submitter name as the page heading', () => {
    const html = renderSubmitterPage(baseParams());

    expect(html).toContain('<h2 class="wt-page-title"><span class="NAME" dir="auto" translate="no">Miron Ophir</span></h2>');
  });

  describe('the facts table', () => {
    test('is omitted entirely when there are no facts', () => {
      expect(renderSubmitterPage(baseParams())).not.toContain('wt-facts-table');
    });

    test('renders NOTE facts (no tag allowlist, unlike Repository which excludes NOTE)', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
            facts: [{ tag: 'NOTE', value: 'Web:http://www.ophir.org.il', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).toContain('Note');
      expect(html).toContain('<div class="wt-fact-value">Web:http://www.ophir.org.il</div>');
    });

    test('renders ADDR with a "wt-fact-value" line, joining CONT continuations with <br>', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
            facts: [{ tag: 'ADDR', value: '28 Moshe Dayan St.\n5645014 Yehud\nIsrael', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).toContain('Address');
      expect(html).toContain('<div class="wt-fact-value">28 Moshe Dayan St.<br>5645014 Yehud<br>Israel</div>');
    });

    test('a fact with an empty value (real in this tree - a blank PHON) renders no value line, just the label', () => {
      const html = renderSubmitterPage(
        baseParams({ submitter: { ...baseParams().submitter, facts: [{ tag: 'PHON', value: '', date: '', time: '', author: '' }] } }),
      );

      expect(html).toContain('Phone');
      expect(html).not.toContain('wt-fact-value');
    });

    test('renders EMAIL as a mailto: link', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
            facts: [{ tag: 'EMAIL', value: 'miron@ophir.org.il', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).toContain('Email address');
      expect(html).toContain('<a dir="ltr" href="mailto:miron@ophir.org.il">miron@ophir.org.il</a>');
    });

    test('renders WWW as an external link', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
            facts: [{ tag: 'WWW', value: 'https://ophir.org.il', date: '', time: '', author: '' }],
          },
        }),
      );

      expect(html).toContain('URL');
      expect(html).toContain('<a href="https://ophir.org.il">https://ophir.org.il</a>');
    });

    test('renders a fact\'s "other attributes" as their own label/value line', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
            facts: [
              {
                tag: 'ADDR',
                value: '28 Moshe Dayan St.',
                date: '',
                time: '',
                author: '',
                otherAttributes: [{ label: 'SUBM:ADDR:CITY', value: 'Yehud' }],
              },
            ],
          },
        }),
      );

      expect(html).toContain('<div><span class="label">SUBM:ADDR:CITY</span>: <span class="value align-top">Yehud</span></div>');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderSubmitterPage(
        baseParams({ submitter: { ...baseParams().submitter, facts: [{ tag: 'PHON', value: '02-1234567', date: '', time: '', author: '' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-PHON');
      expect(html).not.toContain('descriptionbox');
    });

    test('escapes value content', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: { ...baseParams().submitter, facts: [{ tag: 'NAME', value: '<script>alert(1)</script>', date: '', time: '', author: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    test('renders CHAN with date and time in separate spans, and a bolded author line', () => {
      const html = renderSubmitterPage(
        baseParams({
          submitter: {
            ...baseParams().submitter,
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
      const html = renderSubmitterPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderSubmitterPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
