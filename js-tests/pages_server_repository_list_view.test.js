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
import { renderRepositoryListPage } from '../pages-server/repository-list-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    title: 'Repositories',
    repositories: [],
    ...overrides,
  };
}

describe('renderRepositoryListPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderRepositoryListPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderRepositoryListPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the page title', () => {
    expect(renderRepositoryListPage(baseParams())).toContain('<h2 class="wt-page-title">Repositories</h2>');
  });

  test('omits the table entirely when there are no repositories', () => {
    expect(renderRepositoryListPage(baseParams())).not.toContain('<table');
  });

  test('renders one row per repository with name link, source count, and last change', () => {
    const html = renderRepositoryListPage(
      baseParams({
        repositories: [
          {
            xref: 'R1',
            url: '/tree/ophir/repository/R1',
            fullNameHtml: '<span class="NAME" dir="auto" translate="no">Israel State Archives</span>',
            sourceCount: 12,
            lastChange: { date: 'December 30, 2017', time: '17:45:26' },
          },
        ],
      }),
    );

    expect(html).toContain('<a href="/tree/ophir/repository/R1"><span class="NAME" dir="auto" translate="no">Israel State Archives</span></a>');
    expect(html).toContain('<td class="text-center">12</td>');
    expect(html).toContain('<span class="date">December 30, 2017</span> – <span class="date">17:45:26</span>');
  });

  test('a repository with no CHAN fact shows "Never"', () => {
    const html = renderRepositoryListPage(
      baseParams({
        repositories: [{ xref: 'R2', url: '/tree/ophir/repository/R2', fullNameHtml: '<bdi>R2</bdi>', sourceCount: 0, lastChange: null }],
      }),
    );

    expect(html).toContain('<span class="wt-timestamp">Never</span>');
  });

  test('a date with no time omits the time span entirely', () => {
    const html = renderRepositoryListPage(
      baseParams({
        repositories: [
          {
            xref: 'R2',
            url: '/tree/ophir/repository/R2',
            fullNameHtml: '<bdi>R2</bdi>',
            sourceCount: 0,
            lastChange: { date: 'December 30, 2017', time: '' },
          },
        ],
      }),
    );

    expect(html).toContain('<td><span class="date">December 30, 2017</span></td>');
  });

  test('escapes the page title', () => {
    expect(renderRepositoryListPage(baseParams({ title: '<script>alert(1)</script>' }))).toContain('&lt;script&gt;');
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderRepositoryListPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderRepositoryListPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
