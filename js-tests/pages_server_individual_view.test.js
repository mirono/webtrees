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
    tree: { name: 'ophir' },
    user: null,
    csrfToken: null,
    individual: {
      xref: 'X1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>',
      lifespan: '1870–1920',
      age: '(aged 50 years)',
      facts: [],
    },
    ...overrides,
  };
}

describe('renderIndividualPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
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
