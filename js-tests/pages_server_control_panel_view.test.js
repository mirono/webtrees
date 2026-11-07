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
import { renderControlPanelPage } from '../pages-server/control-panel-view.mjs';

function emptyMap() {
  return new Map();
}

const BASE_PARAMS = {
  csrfToken: 'tok123',
  trees: [],
  treeCounts: {
    changes: emptyMap(),
    individuals: emptyMap(),
    families: emptyMap(),
    sources: emptyMap(),
    repositories: emptyMap(),
    media: emptyMap(),
    notes: emptyMap(),
    submitters: emptyMap(),
  },
  listUrls: {
    individual: () => null,
    family: () => null,
    source: () => null,
    repository: () => null,
    media: () => null,
    note: () => null,
    submitter: () => null,
  },
  users: { all: [], administrators: [], managers: [], moderators: [], unapproved: [], unverified: [], recipients: [] },
  moduleSummary: { counts: {}, otherModules: [], deletedModules: [], allEnabled: 0, allTotal: 0 },
  filesToDelete: [],
};

describe('renderControlPanelPage', () => {
  test('renders the page shell with the csrf token', () => {
    const html = renderControlPanelPage(BASE_PARAMS);

    expect(html).toContain('<title>Control panel</title>');
    expect(html).toContain('<meta name="csrf" content="tok123">');
    expect(html).toContain('<h1>Control panel</h1>');
  });

  test('shows "you need to create a family tree" when there are none', () => {
    const html = renderControlPanelPage(BASE_PARAMS);
    expect(html).toContain('You need to create a family tree.');
  });

  test('renders a tree row with real counts and list links', () => {
    const params = {
      ...BASE_PARAMS,
      trees: [{ gedcomId: 1, name: 'ophir', title: 'The Ophir Family Tree' }],
      treeCounts: {
        changes: new Map([[1, 3]]),
        individuals: new Map([[1, 100]]),
        families: new Map([[1, 40]]),
        sources: new Map([[1, 0]]),
        repositories: new Map([[1, 2]]),
        media: new Map([[1, 10]]),
        notes: new Map([[1, 0]]),
        submitters: new Map([[1, 1]]),
      },
      listUrls: { ...BASE_PARAMS.listUrls, individual: (t) => `/tree/${t}/individual-list`, submitter: () => null },
    };

    const html = renderControlPanelPage(params);

    expect(html).toContain('ophir - The Ophir Family Tree');
    expect(html).toContain('<a href="/tree/ophir/individual-list">100</a>');
    // Zero counts render as a bare dash, not a link.
    expect(html).toMatch(/align-digits">-<\/td>/);
    // submitter has a count but no list module enabled -> plain number, no link.
    expect(html).not.toContain('<a href="/tree/ophir/submitter-list">1</a>');
    // A pending-changes count links to the pending-changes page.
    expect(html).toContain('/tree/ophir/pending?url=%2Fadmin');
    expect(html).toContain('class="danger"');
  });

  test('omits the merge-trees link with only one tree, includes it with more than one', () => {
    const oneTree = renderControlPanelPage({ ...BASE_PARAMS, trees: [{ gedcomId: 1, name: 'a', title: 'A' }] });
    expect(oneTree).not.toContain('/admin/trees/merge');

    const twoTrees = renderControlPanelPage({
      ...BASE_PARAMS,
      trees: [
        { gedcomId: 1, name: 'a', title: 'A' },
        { gedcomId: 2, name: 'b', title: 'B' },
      ],
    });
    expect(twoTrees).toContain('/admin/trees/merge');
  });

  test('renders user groups, falling back to an em-dash when empty', () => {
    const params = {
      ...BASE_PARAMS,
      users: {
        ...BASE_PARAMS.users,
        administrators: [{ userId: 1, realName: 'Admin User' }],
        recipients: [{ to: 'all', label: 'Send a message to all users' }],
      },
    };

    const html = renderControlPanelPage(params);

    expect(html).toContain('/admin/admin-users-edit?user_id=1');
    expect(html).toContain('Admin User');
    expect(html).toContain('>—<');
    expect(html).toContain('/admin/broadcast/all');
  });

  test('renders module category badges and the Other section with muted disabled modules', () => {
    const params = {
      ...BASE_PARAMS,
      moduleSummary: {
        counts: { chart: { enabled: 10, total: 13 } },
        otherModules: [
          { name: 'ckeditor', title: 'CKEditor™', enabled: true },
          { name: 'sitemap', title: 'Sitemaps', enabled: false },
        ],
        deletedModules: [],
        allEnabled: 100,
        allTotal: 150,
      },
    };

    const html = renderControlPanelPage(params);

    expect(html).toContain('<span class="badge bg-primary">10 / 13</span>');
    expect(html).toContain('<span class="badge bg-secondary">100 / 150</span>');
    expect(html).toContain('CKEditor™');
    expect(html).toContain('<span class="text-muted"><span class="fa-li">');
    expect(html).toContain('Sitemaps');
  });

  test('renders the old-files card only when there are files to delete', () => {
    const withoutFiles = renderControlPanelPage(BASE_PARAMS);
    expect(withoutFiles).not.toContain('Old files found');

    const withFiles = renderControlPanelPage({ ...BASE_PARAMS, filesToDelete: ['client.php', 'images'] });
    expect(withFiles).toContain('Old files found');
    expect(withFiles).toContain('<code>client.php</code>');
    expect(withFiles).toContain('<code>images</code>');
  });

  test('escapes HTML-unsafe tree and user names', () => {
    const html = renderControlPanelPage({
      ...BASE_PARAMS,
      trees: [{ gedcomId: 1, name: '<x>', title: '<y>' }],
      treeCounts: BASE_PARAMS.treeCounts,
    });

    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
  });
});
