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

import { describe, expect, test, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import * as usersAdmin from '../pages-server/users-admin.mjs';

describe('users-admin.mjs', () => {
  describe('findUserByUserName / findUserByEmail', () => {
    test('returns the user_id when found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 7 }] }) };
      expect(await usersAdmin.findUserByUserName(pool, 'bob')).toBe(7);
    });

    test('returns null when not found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      expect(await usersAdmin.findUserByEmail(pool, 'nobody@example.com')).toBeNull();
    });
  });

  describe('createUser', () => {
    test('hashes the password and writes the expected default settings', async () => {
      const queries = [];
      const pool = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.startsWith('INSERT INTO wt_user')) {
            return Promise.resolve({ rows: [{ user_id: 99 }] });
          }
          if (sql.includes('TIMEZONE')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const userId = await usersAdmin.createUser(pool, { username: 'newbie', realName: 'New Bie', email: 'n@example.com', password: 'hunter22' });

      expect(userId).toBe(99);

      const insertUser = queries.find((q) => q.sql.startsWith('INSERT INTO wt_user'));
      expect(insertUser.params[0]).toBe('newbie');
      expect(bcrypt.compareSync('hunter22', insertUser.params[3])).toBe(true);

      const settingNames = queries.filter((q) => q.sql.includes('wt_user_setting')).map((q) => q.params[1]);
      expect(settingNames).toEqual(expect.arrayContaining(['verified', 'verified_by_admin', 'language', 'TIMEZONE', 'reg_timestamp', 'sessiontime']));

      const verifiedSetting = queries.find((q) => q.params?.[1] === 'verified');
      expect(verifiedSetting.params[2]).toBe('1');
    });

    test('falls back to UTC when no site TIMEZONE setting exists', async () => {
      const queries = [];
      const pool = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.startsWith('INSERT INTO wt_user')) return Promise.resolve({ rows: [{ user_id: 1 }] });
          if (sql.includes("setting_name = 'TIMEZONE'")) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        }),
      };

      await usersAdmin.createUser(pool, { username: 'a', realName: 'A', email: 'a@example.com', password: 'password1' });

      const tzSetting = queries.find((q) => q.params?.[1] === 'TIMEZONE' && q.sql.includes('wt_user_setting'));
      expect(tzSetting.params[2]).toBe('UTC');
    });
  });

  describe('loadUserForEdit', () => {
    test('returns null when the user does not exist', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      expect(await usersAdmin.loadUserForEdit(pool, 404)).toBeNull();
    });

    test('groups preferences and per-tree settings', async () => {
      const pool = {
        query: vi.fn((sql) => {
          if (sql.includes('FROM wt_user WHERE')) {
            return Promise.resolve({ rows: [{ user_id: 5, user_name: 'bob', real_name: 'Bob', email: 'bob@example.com' }] });
          }
          if (sql.includes('wt_user_setting')) {
            return Promise.resolve({ rows: [{ setting_name: 'theme', setting_value: 'colors' }] });
          }
          if (sql.includes('wt_user_gedcom_setting')) {
            return Promise.resolve({
              rows: [
                { gedcom_id: 1, setting_name: 'canedit', setting_value: 'admin' },
                { gedcom_id: 1, setting_name: 'gedcomid', setting_value: 'I1' },
                { gedcom_id: 1, setting_name: 'RELATIONSHIP_PATH_LENGTH', setting_value: '3' },
              ],
            });
          }
          throw new Error(`unexpected query: ${sql}`);
        }),
      };

      const user = await usersAdmin.loadUserForEdit(pool, 5);

      expect(user.preferences.theme).toBe('colors');
      expect(user.treePreferences.get(1)).toEqual({ role: 'admin', gedcomId: 'I1', pathLength: 3 });
    });
  });

  describe('updateUser', () => {
    function buildPool({ currentUser, duplicateEmailUserId = null, duplicateUserNameUserId = null } = {}) {
      const queries = [];
      const pool = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });

          if (sql.includes('SELECT user_name, email FROM wt_user')) {
            return Promise.resolve({ rows: [currentUser] });
          }
          if (sql === 'SELECT user_id FROM wt_user WHERE email = $1') {
            return Promise.resolve({ rows: duplicateEmailUserId !== null ? [{ user_id: duplicateEmailUserId }] : [] });
          }
          if (sql === 'SELECT user_id FROM wt_user WHERE user_name = $1') {
            return Promise.resolve({ rows: duplicateUserNameUserId !== null ? [{ user_id: duplicateUserNameUserId }] : [] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      return { pool, queries };
    }

    test('writes every preference and the per-tree fields', async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' } });
      const formData = new URLSearchParams({
        user_id: '5',
        username: 'bob',
        real_name: 'Bob',
        email: 'bob@example.com',
        password: '',
        theme: 'colors',
        language: 'en-US',
        timezone: 'UTC',
        'contact-method': 'internal',
        comment: 'note',
        auto_accept: '1',
        'visible-online': '1',
        verified: '1',
        approved: '1',
        canedit1: 'edit',
        gedcomid1: 'I5',
        RELATIONSHIP_PATH_LENGTH1: '2',
      });

      const { errors } = await usersAdmin.updateUser(pool, 1, [{ gedcomId: 1 }], formData);

      expect(errors).toEqual([]);
      const treeUpsert = queries.find((q) => q.sql.includes('wt_user_gedcom_setting') && q.params[2] === 'canedit');
      expect(treeUpsert.params).toEqual([1, 5, 'canedit', 'edit']);
    });

    test('zeroes the relationship path length when no individual is linked', async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' } });
      const formData = new URLSearchParams({ user_id: '5', username: 'bob', email: 'bob@example.com', gedcomid1: '', RELATIONSHIP_PATH_LENGTH1: '7', canedit1: 'none' });

      await usersAdmin.updateUser(pool, 1, [{ gedcomId: 1 }], formData);

      const pathUpsert = queries.find((q) => q.sql.includes('wt_user_gedcom_setting') && q.params[2] === 'RELATIONSHIP_PATH_LENGTH');
      expect(pathUpsert.params[3]).toBe('0');
    });

    test("a logged-in admin can't change their own admin flag", async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' } });
      const formData = new URLSearchParams({ user_id: '1', username: 'bob', email: 'bob@example.com', canadmin: '1' });

      await usersAdmin.updateUser(pool, 1, [], formData);

      expect(queries.some((q) => q.params?.[1] === 'canadmin')).toBe(false);
    });

    test('a different admin editing someone else CAN change their admin flag', async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' } });
      const formData = new URLSearchParams({ user_id: '5', username: 'bob', email: 'bob@example.com', canadmin: '1' });

      await usersAdmin.updateUser(pool, 1, [], formData);

      const adminUpsert = queries.find((q) => q.params?.[1] === 'canadmin');
      expect(adminUpsert.params[2]).toBe('1');
    });

    test('reports a duplicate email and skips writing it, but keeps every other field change', async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' }, duplicateEmailUserId: 99 });
      const formData = new URLSearchParams({ user_id: '5', username: 'bob', email: 'taken@example.com', theme: 'colors' });

      const { errors } = await usersAdmin.updateUser(pool, 1, [], formData);

      expect(errors).toEqual(['Duplicate email address. A user with that email already exists.']);
      expect(queries.some((q) => q.sql === 'UPDATE wt_user SET email = $1 WHERE user_id = $2')).toBe(false);
      expect(queries.some((q) => q.params?.[1] === 'theme')).toBe(true);
    });

    test('reports a duplicate username', async () => {
      const { pool } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' }, duplicateUserNameUserId: 99 });
      const formData = new URLSearchParams({ user_id: '5', username: 'taken', email: 'bob@example.com' });

      const { errors } = await usersAdmin.updateUser(pool, 1, [], formData);

      expect(errors).toEqual(['Duplicate username. A user with that username already exists. Please choose another username.']);
    });

    test('updates the password only when one was submitted', async () => {
      const { pool, queries } = buildPool({ currentUser: { user_name: 'bob', email: 'bob@example.com' } });
      const formData = new URLSearchParams({ user_id: '5', username: 'bob', email: 'bob@example.com', password: 'newpassword1' });

      await usersAdmin.updateUser(pool, 1, [], formData);

      const passwordUpdate = queries.find((q) => q.sql === 'UPDATE wt_user SET password = $1 WHERE user_id = $2');
      expect(bcrypt.compareSync('newpassword1', passwordUpdate.params[0])).toBe(true);
    });
  });

  describe('userEditMenuHtml', () => {
    const user = { userId: 5, realName: 'Bob Smith', isAdmin: false };

    test('shows masquerade and delete for another non-admin user', () => {
      const html = usersAdmin.userEditMenuHtml(user, 1);
      expect(html).toContain('/admin/masquerade/5');
      expect(html).toContain('/admin/users/delete/5');
    });

    test('hides masquerade and delete for your own row', () => {
      const html = usersAdmin.userEditMenuHtml(user, 5);
      expect(html).not.toContain('/admin/masquerade/5');
      expect(html).not.toContain('/admin/users/delete/5');
    });

    test('hides delete (but not masquerade) for another administrator', () => {
      const admin = { userId: 2, realName: 'Admin Two', isAdmin: true };
      const html = usersAdmin.userEditMenuHtml(admin, 1);
      expect(html).toContain('/admin/masquerade/2');
      expect(html).not.toContain('/admin/users/delete/2');
    });

    test('escapes the real name in the delete confirmation', () => {
      const html = usersAdmin.userEditMenuHtml({ userId: 9, realName: '<script>', isAdmin: false }, 1);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('userListRow', () => {
    function row(overrides = {}) {
      return {
        user_id: 5,
        user_name: 'bob',
        real_name: 'Bob Smith',
        email: 'bob@example.com',
        language: 'en-US',
        registered_at: null,
        active_at: null,
        verified: '0',
        verified_by_admin: '0',
        canadmin: null,
        ...overrides,
      };
    }

    test('shows "Never" for a user who has never signed in', () => {
      const cells = usersAdmin.userListRow(row(), 1);
      expect(cells[9]).toBe('Never');
    });

    test('highlights an old, still-unapproved registration in red', () => {
      const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 86400;
      const cells = usersAdmin.userListRow(row({ registered_at: String(eightDaysAgo), verified_by_admin: '0' }), 1);
      expect(cells[7]).toContain('text-danger');
    });

    test('does not highlight an already-approved old registration', () => {
      const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 86400;
      const cells = usersAdmin.userListRow(row({ registered_at: String(eightDaysAgo), verified_by_admin: '1' }), 1);
      expect(cells[7]).not.toContain('text-danger');
    });

    test('reports yes/no for verified/approved', () => {
      const cells = usersAdmin.userListRow(row({ verified: '1', verified_by_admin: '1' }), 1);
      expect(cells[10]).toBe('yes');
      expect(cells[11]).toBe('yes');
    });
  });

  describe('deleteUserTransactional', () => {
    test('reassigns non-rejected changes to the acting admin and removes rejected ones', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await usersAdmin.deleteUserTransactional(pool, 5, 1);

      expect(queries[0].sql).toBe('BEGIN');
      expect(queries.at(-1).sql).toBe('COMMIT');
      expect(queries.some((q) => q.sql.includes("DELETE FROM wt_change WHERE user_id = $1 AND status = 'rejected'") && q.params[0] === 5)).toBe(true);
      expect(queries.some((q) => q.sql === 'UPDATE wt_change SET user_id = $1 WHERE user_id = $2' && q.params[0] === 1 && q.params[1] === 5)).toBe(true);
      expect(client.release).toHaveBeenCalled();
    });

    test('rolls back on failure', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql) => {
          queries.push(sql);
          if (sql === 'DELETE FROM wt_user WHERE user_id = $1') {
            return Promise.reject(new Error('boom'));
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await expect(usersAdmin.deleteUserTransactional(pool, 5, 1)).rejects.toThrow('boom');
      expect(queries.at(-1)).toBe('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('buildUserListQuery', () => {
    test('excludes user_id 0 and selects the 11 real PHP columns', () => {
      const { sql } = usersAdmin.buildUserListQuery();
      expect(sql).toContain('u.user_id > 0');
      expect(sql).toContain('AS language');
      expect(sql).toContain('AS verified_by_admin');
      expect(sql).toContain('AS canadmin');
    });
  });
});
