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
import { renderUsersListPage, renderUserAddPage, renderUserEditPage } from '../pages-server/users-admin-view.mjs';

describe('renderUsersListPage', () => {
  test('renders the server-side DataTables shell with the real ajax/columns config', () => {
    const html = renderUsersListPage({ csrfToken: 'tok' });

    expect(html).toContain('data-server-side="true"');
    expect(html).toContain('"url":"/admin/admin-users-data"');
    expect(html).toContain('id="wt-datatables-admin-users"');
  });

  test('embeds the filter into data-search', () => {
    const html = renderUsersListPage({ csrfToken: 'tok', filter: 'bob' });
    expect(html).toContain('data-search=\'{"search":"bob"}\'');
  });
});

describe('renderUserAddPage', () => {
  test('pre-fills the submitted values on a duplicate-check redirect', () => {
    const html = renderUserAddPage({ csrfToken: 'tok', values: { email: 'a@example.com', realName: 'Alice', username: 'alice' } });

    expect(html).toContain('value="a@example.com"');
    expect(html).toContain('value="Alice"');
    expect(html).toContain('value="alice"');
    expect(html).toContain('action="/admin/admin-users-create"');
  });

  test('escapes HTML-unsafe values', () => {
    const html = renderUserAddPage({ csrfToken: 'tok', values: { email: '', realName: '"><img src=x>', username: '' } });
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
  });
});

describe('renderUserEditPage', () => {
  const BASE_USER = {
    userId: 5,
    userName: 'bob',
    realName: 'Bob Smith',
    email: 'bob@example.com',
    preferences: { verified: '1', verified_by_admin: '1', theme: 'colors', language: 'en-US', TIMEZONE: 'UTC' },
    treePreferences: new Map([[1, { role: 'edit', gedcomId: 'I5', pathLength: 3 }]]),
  };
  const TREES = [{ gedcomId: 1, title: 'The Test Tree' }];

  test('shows the admin checkbox when editing someone else', () => {
    const html = renderUserEditPage({ csrfToken: 'tok', user: BASE_USER, trees: TREES, isSelf: false });
    expect(html).toContain('name="canadmin"');
  });

  test('hides the admin checkbox when editing your own account', () => {
    const html = renderUserEditPage({ csrfToken: 'tok', user: BASE_USER, trees: TREES, isSelf: true });
    expect(html).not.toContain('name="canadmin"');
  });

  test('pre-selects the correct role, individual, and relationship-path-length for each tree', () => {
    const html = renderUserEditPage({ csrfToken: 'tok', user: BASE_USER, trees: TREES, isSelf: false });

    expect(html).toContain('<option value="edit" selected>Editor</option>');
    expect(html).toContain('value="I5"');
    expect(html).toContain('<option value="3" selected>3</option>');
  });

  test('defaults an unconfigured tree to Visitor with no individual linked', () => {
    const user = { ...BASE_USER, treePreferences: new Map() };
    const html = renderUserEditPage({ csrfToken: 'tok', user, trees: TREES, isSelf: false });

    expect(html).toContain('<option value="none" selected>Visitor</option>');
    expect(html).toContain('<option value="0" selected>No</option>');
  });

  test('renders error messages when given', () => {
    const html = renderUserEditPage({ csrfToken: 'tok', user: BASE_USER, trees: TREES, isSelf: false, errors: ['Duplicate username.'] });
    expect(html).toContain('Duplicate username.');
    expect(html).toContain('alert-danger');
  });

  test('escapes HTML-unsafe names', () => {
    const user = { ...BASE_USER, realName: '"><img src=x>' };
    const html = renderUserEditPage({ csrfToken: 'tok', user, trees: TREES, isSelf: false });
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
  });
});
