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
import { renderTreePage } from '../pages-server/tree-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { name: 'ophir', title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    welcomeBlock: null,
    ...overrides,
  };
}

describe('renderTreePage', () => {
  // Same [dir]-selector CSS finding as account-view.mjs/login-view.mjs -
  // this is required for correct rendering, not decorative.
  test('the <html> tag declares dir="ltr"', () => {
    const html = renderTreePage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('renders the tree title in the page chrome', () => {
    const html = renderTreePage(baseParams());

    expect(html).toContain('<title>The Ophir Family Tree</title>');
    expect(html).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  describe('the welcome block', () => {
    test('is omitted entirely when welcomeBlock is null', () => {
      const html = renderTreePage(baseParams({ welcomeBlock: null }));

      expect(html).not.toContain('wt-block-gedcom_block');
    });

    test('is omitted when welcomeBlock has zero links', () => {
      const html = renderTreePage(baseParams({ welcomeBlock: { blockId: 42, links: [] } }));

      expect(html).not.toContain('wt-block-gedcom_block');
    });

    test('renders each link when populated, using the real (non-kebab-cased) module_name CSS class', () => {
      const html = renderTreePage(
        baseParams({
          welcomeBlock: {
            blockId: 42,
            links: [
              { url: '/tree/ophir/individual/I1', title: 'Default individual', iconClass: 'icon-indis' },
              { url: '/register/ophir', title: 'Request a new user account', iconClass: 'icon-user_add' },
            ],
          },
        }),
      );

      expect(html).toContain('wt-block-gedcom_block');
      expect(html).toContain('id="block-42"');
      expect(html).toContain('href="/tree/ophir/individual/I1"');
      expect(html).toContain('Default individual');
      expect(html).toContain('href="/register/ophir"');
      expect(html).toContain('Request a new user account');
    });

    test('escapes link content', () => {
      const html = renderTreePage(
        baseParams({
          welcomeBlock: {
            blockId: 42,
            links: [{ url: '/tree/ophir/individual/I1?x="><script>', title: '<b>hi</b>', iconClass: 'icon-indis' }],
          },
        }),
      );

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>hi</b>');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderTreePage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderTreePage(
        baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }),
      );

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
