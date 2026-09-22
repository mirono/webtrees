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
import { renderIndividualPage } from '../pages-server/individual-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    individual: {
      xref: 'X1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>',
      lifespan: '1870–1920',
      age: '(aged 50 years)',
      facts: [],
      parentFamilies: [],
      spouseFamilies: [],
    },
    ...overrides,
  };
}

describe('renderIndividualPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  // Regression test: the header used tree.name (the short slug, e.g.
  // "ophir") instead of tree.title (the real display title, e.g. "The
  // Ophir Family Tree") - caught via a live screenshot comparison
  // against the real PHP page.
  test('the header shows the tree title, not its slug', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('the pre-escaped fullNameHtml is inserted raw, not re-escaped', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>');
  });

  test('lifespan and age are escaped and rendered', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('1870–1920');
    expect(html).toContain('(aged 50 years)');
  });

  describe('the Families section', () => {
    test('is omitted entirely when there are no related families', () => {
      const html = renderIndividualPage(baseParams());

      expect(html).not.toContain('Families');
    });

    test('renders a parent family with a "Parents" label, linking to the family page', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            parentFamilies: [{ titleHtml: '<span class="NAME">Dad</span> + <span class="NAME">Mom</span>', url: '/tree/ophir/family/F1' }],
          },
        }),
      );

      expect(html).toContain('Families');
      expect(html).toContain('Parents');
      expect(html).toContain('href="/tree/ophir/family/F1"');
      expect(html).toContain('<span class="NAME">Dad</span> + <span class="NAME">Mom</span>');
    });

    test('renders a spouse family with a "Spouse family" label', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            spouseFamilies: [{ titleHtml: '<span class="NAME">John</span> + <span class="NAME">Jane</span>', url: '/tree/ophir/family/F2' }],
          },
        }),
      );

      expect(html).toContain('Spouse family');
      expect(html).toContain('href="/tree/ophir/family/F2"');
    });

    test('renders multiple parent and spouse families, each on their own row', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            parentFamilies: [{ titleHtml: 'Family A', url: '/tree/ophir/family/F1' }],
            spouseFamilies: [
              { titleHtml: 'Family B', url: '/tree/ophir/family/F2' },
              { titleHtml: 'Family C', url: '/tree/ophir/family/F3' },
            ],
          },
        }),
      );

      expect(html).toContain('Family A');
      expect(html).toContain('Family B');
      expect(html).toContain('Family C');
    });
  });

  describe('the vital-facts list', () => {
    test('is omitted entirely when there are no facts', () => {
      const html = renderIndividualPage(baseParams({ individual: { ...baseParams().individual, facts: [] } }));

      expect(html).not.toContain('wt-facts-table');
    });

    test('renders each fact with a known label', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            facts: [
              { tag: 'BIRT', date: '12 AUG 1870', place: 'London' },
              { tag: 'DEAT', date: '1 JAN 1920', place: 'Paris' },
            ],
          },
        }),
      );

      expect(html).toContain('Birth');
      expect(html).toContain('12 AUG 1870');
      expect(html).toContain('London');
      expect(html).toContain('Death');
      expect(html).toContain('1 JAN 1920');
      expect(html).toContain('Paris');
    });

    // Regression test: an earlier draft used invented CSS classes
    // (descriptionbox/rela) that don't exist in this app's real
    // webtrees.min.css at all, leaving the whole table unstyled -
    // assert the REAL class names fact.phtml actually uses.
    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderIndividualPage(
        baseParams({ individual: { ...baseParams().individual, facts: [{ tag: 'BIRT', date: '12 AUG 1870', place: 'London' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-BIRT');
      expect(html).toContain('wt-fact-date-age');
      expect(html).toContain('wt-fact-place');
      expect(html).not.toContain('descriptionbox');
    });

    test('an unrecognized tag falls back to the raw tag name', () => {
      const html = renderIndividualPage(
        baseParams({ individual: { ...baseParams().individual, facts: [{ tag: 'CREM', date: '', place: '' }] } }),
      );

      expect(html).toContain('Cremation');
    });

    test('escapes date/place content', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: { ...baseParams().individual, facts: [{ tag: 'BIRT', date: '<script>alert(1)</script>', place: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    // Regression test: an earlier draft narrowed this list to just
    // BIRT/CHR/BAPM/DEAT/BURI/CREM, invisible for the many other real
    // event/attribute tags (RESI, CENS, IMMI, EVEN, ...) the user's
    // real imported tree turned out to have.
    test('renders non-vital event/attribute facts too, e.g. Residence', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: { ...baseParams().individual, facts: [{ tag: 'RESI', date: '27 APR 1996', place: 'Ramat Gan, Israel' }] },
        }),
      );

      expect(html).toContain('Residence');
      expect(html).toContain('27 APR 1996');
      expect(html).toContain('Ramat Gan, Israel');
    });

    test('renders CHAN with date and time in separate spans, and an author line', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            facts: [{ tag: 'CHAN', date: 'November 9, 2018', time: '19:38:08', place: '', author: 'miron' }],
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
      const html = renderIndividualPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderIndividualPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
