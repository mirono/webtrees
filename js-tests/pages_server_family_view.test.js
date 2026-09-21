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

  // Regression test: an earlier draft used invented CSS classes
  // (wt-family-member/wt-family-member-role) that don't exist in this
  // app's real webtrees.min.css at all, leaving every member "card"
  // completely unstyled (no border, no card shape) - reported live as
  // "the family page shows only facts" (the cards were there, just
  // visually blended into nothing next to the properly-styled facts
  // table). Assert the REAL chart-box.phtml class names instead.
  test('member cards use the real chart-box.phtml class names, not invented ones', () => {
    const html = renderFamilyPage(baseParams());

    expect(html).toContain('wt-chart-box');
    expect(html).toContain('wt-chart-box-name');
    expect(html).toContain('wt-chart-box-lifespan');
    expect(html).not.toContain('wt-family-member"');
    expect(html).not.toContain('wt-family-member-role');
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

    // Regression test: family-page.phtml's real "Facts and events"
    // heading was missing entirely from an earlier draft.
    test('shows the "Facts and events" heading when facts are present', () => {
      const html = renderFamilyPage(
        baseParams({ family: { ...baseParams().family, facts: [{ tag: 'MARR', date: '17 AUG 1995', place: 'London' }] } }),
      );

      expect(html).toContain('Facts and events');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderFamilyPage(
        baseParams({ family: { ...baseParams().family, facts: [{ tag: 'MARR', date: '17 AUG 1995', place: 'London' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-MARR');
      expect(html).toContain('wt-fact-date-age');
      expect(html).toContain('wt-fact-place');
      expect(html).not.toContain('descriptionbox');
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

    // Regression test: an earlier draft narrowed this table to just
    // MARR/DIV/ANUL/_SEPR, reported live as "I see only marriage and
    // not other facts (Residence probably)".
    test('renders non-marriage facts too, e.g. RESI with an address line', () => {
      const html = renderFamilyPage(
        baseParams({
          family: {
            ...baseParams().family,
            facts: [{ tag: 'RESI', date: '27 APR 1996', place: 'Ramat Gan, Israel', address: 'Savion 7a Ramat-Gan, Israel' }],
          },
        }),
      );

      expect(html).toContain('Family residence');
      expect(html).toContain('27 APR 1996');
      expect(html).toContain('Ramat Gan, Israel');
      expect(html).toContain('Address: Savion 7a Ramat-Gan, Israel');
    });

    test('renders CHAN with combined date+time and an author line', () => {
      const html = renderFamilyPage(
        baseParams({
          family: {
            ...baseParams().family,
            facts: [{ tag: 'CHAN', date: '09 NOV 2018', time: '19:38:08', place: '', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('09 NOV 2018 19:38:08');
      expect(html).toContain('Author of last change: miron');
    });

    test('a fact with neither date nor place nor address nor author renders just the label', () => {
      const html = renderFamilyPage(baseParams({ family: { ...baseParams().family, facts: [{ tag: 'NCHI', date: '', place: '' }] } }));

      expect(html).toContain('Number of children');
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
