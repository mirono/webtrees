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
import { renderFamilyPage } from '../pages-server/family-view.mjs';

function member(name, xref) {
  return {
    fullNameHtml: `<span class="NAME" dir="auto" translate="no">${name}</span>`,
    lifespan: '1870–1920',
    url: `/tree/ophir/individual/${xref}`,
  };
}

function baseParams(overrides = {}) {
  return {
    tree: { name: 'ophir' },
    user: null,
    csrfToken: null,
    family: { husband: member('John DOE', 'I1'), wife: member('Jane DOE', 'I2'), children: [], facts: [] },
    ...overrides,
  };
}

describe('renderFamilyPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    const html = renderFamilyPage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('renders husband and wife names, each linking to their individual page', () => {
    const html = renderFamilyPage(baseParams());

    expect(html).toContain('John DOE');
    expect(html).toContain('href="/tree/ophir/individual/I1"');
    expect(html).toContain('Jane DOE');
    expect(html).toContain('href="/tree/ophir/individual/I2"');
  });

  test('a null husband or wife renders the unknown-name placeholder, not a broken link', () => {
    const html = renderFamilyPage(baseParams({ family: { husband: null, wife: member('Jane DOE', 'I2'), children: [], facts: [] } }));

    expect(html).toContain('…');
    expect(html).not.toContain('href="/tree/ophir/individual/undefined"');
  });

  test('renders each child, linking to their individual page', () => {
    const html = renderFamilyPage(baseParams({ family: { ...baseParams().family, children: [member('Kid One', 'I3'), member('Kid Two', 'I4')] } }));

    expect(html).toContain('Kid One');
    expect(html).toContain('href="/tree/ophir/individual/I3"');
    expect(html).toContain('Kid Two');
    expect(html).toContain('href="/tree/ophir/individual/I4"');
  });

  describe('the vital-facts table', () => {
    test('is omitted entirely when there are no facts', () => {
      const html = renderFamilyPage(baseParams());

      expect(html).not.toContain('wt-facts-table');
    });

    test('renders each fact with a known label', () => {
      const html = renderFamilyPage(
        baseParams({
          family: { ...baseParams().family, facts: [{ tag: 'MARR', date: '17 AUG 1995', place: 'London' }] },
        }),
      );

      expect(html).toContain('Marriage');
      expect(html).toContain('17 AUG 1995');
      expect(html).toContain('London');
    });

    test('escapes date/place content', () => {
      const html = renderFamilyPage(
        baseParams({
          family: { ...baseParams().family, facts: [{ tag: 'MARR', date: '<script>alert(1)</script>', place: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderFamilyPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderFamilyPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
