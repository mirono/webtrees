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
import * as treeManagement from '../pages-server/tree-management.mjs';

describe('tree-management.mjs', () => {
  describe('constants', () => {
    test('ACCESS_LEVEL_NAMES has expected keys and values', () => {
      expect(treeManagement.ACCESS_LEVEL_NAMES[2]).toBe('Show to visitors');
      expect(treeManagement.ACCESS_LEVEL_NAMES[1]).toBe('Show to members');
      expect(treeManagement.ACCESS_LEVEL_NAMES[0]).toBe('Show to managers');
      expect(treeManagement.ACCESS_LEVEL_NAMES['-1']).toBe('Hide from everyone');
    });

    test('PRIVACY_CONSTANTS has expected keys and values', () => {
      expect(treeManagement.PRIVACY_CONSTANTS.none).toBe('Show to visitors');
      expect(treeManagement.PRIVACY_CONSTANTS.privacy).toBe('Show to members');
      expect(treeManagement.PRIVACY_CONSTANTS.confidential).toBe('Show to managers');
      expect(treeManagement.PRIVACY_CONSTANTS.hidden).toBe('Hide from everyone');
    });
  });

  describe('isSiteManager', () => {
    test('returns true for a full admin', async () => {
      const pool = { query: vi.fn() };
      const result = await treeManagement.isSiteManager(pool, { userId: 1, isAdmin: true });
      expect(result).toBe(true);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns false for anonymous user', async () => {
      const pool = { query: vi.fn() };
      const result = await treeManagement.isSiteManager(pool, { userId: null, isAdmin: false });
      expect(result).toBe(false);
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns true when user has canedit=admin setting', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
      const result = await treeManagement.isSiteManager(pool, { userId: 5, isAdmin: false });
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        "SELECT 1 FROM wt_user_gedcom_setting WHERE user_id = $1 AND setting_name = 'canedit' AND setting_value = 'admin' LIMIT 1",
        [5]
      );
    });

    test('returns false when user does not have canedit=admin setting', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.isSiteManager(pool, { userId: 5, isAdmin: false });
      expect(result).toBe(false);
    });
  });

  describe('isTreeImporting', () => {
    test('returns true when tree has unimported chunks', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
      const result = await treeManagement.isTreeImporting(pool, 3);
      expect(result).toBe(true);
    });

    test('returns false when no unimported chunks', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.isTreeImporting(pool, 3);
      expect(result).toBe(false);
    });
  });

  describe('findTreeIdByName', () => {
    test('returns gedcom_id when tree is found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ gedcom_id: 5 }] }) };
      const result = await treeManagement.findTreeIdByName(pool, 'mytree');
      expect(result).toBe(5);
    });

    test('returns null when tree is not found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.findTreeIdByName(pool, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('uniqueTreeName', () => {
    test('returns tree1 when no trees exist', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.uniqueTreeName(pool);
      expect(result).toBe('tree1');
    });

    test('increments past existing tree names', async () => {
      const pool = {
        query: vi.fn((sql, params) => {
          const name = params[0];
          if (name === 'tree1' || name === 'tree2') {
            return Promise.resolve({ rows: [{ gedcom_id: 1 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      const result = await treeManagement.uniqueTreeName(pool);
      expect(result).toBe('tree3');
    });
  });

  describe('createTree', () => {
    test('inserts a new tree with all required settings', async () => {
      const queries = [];
      const pool = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.includes('RETURNING gedcom_id')) {
            return Promise.resolve({ rows: [{ gedcom_id: 10 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      };

      const result = await treeManagement.createTree(pool, { name: 'newtree', title: 'New Tree', userId: 3 });

      expect(result).toBe(10);

      const insertGedcom = queries.find((q) => q.sql.includes('INSERT INTO wt_gedcom'));
      expect(insertGedcom.params).toEqual(['newtree', 'newtree.ged', 'New Tree', 3]);

      const insertSettings = queries.filter((q) => q.sql.includes('INSERT INTO wt_gedcom_setting'));
      expect(insertSettings.length).toBeGreaterThanOrEqual(2);
      expect(insertSettings.some((q) => q.params[0] === 10)).toBe(true);

      const surnameQuery = queries.find((q) => q.sql.includes('SURNAME_TRADITION'));
      expect(surnameQuery).toBeDefined();
      expect(surnameQuery.sql).toContain('paternal');
    });
  });

  describe('setDefaultTree', () => {
    test('upserts the DEFAULT_GEDCOM setting', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await treeManagement.setDefaultTree(pool, 'mytree');
      expect(pool.query).toHaveBeenCalledWith(
        "INSERT INTO wt_site_setting (setting_name, setting_value) VALUES ('DEFAULT_GEDCOM', $1) ON CONFLICT (setting_name) DO UPDATE SET setting_value = $1",
        ['mytree']
      );
    });
  });

  describe('countCommonXrefs', () => {
    test('counts xrefs common to both trees', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '5' }] }),
      };
      const result = await treeManagement.countCommonXrefs(pool, 1, 2);
      expect(result).toBe(5);
      expect(pool.query).toHaveBeenCalled();
      const call = pool.query.mock.calls[0];
      expect(call[0]).toContain('UNION');
      expect(call[1].length).toBe(12);
    });
  });

  describe('deleteTreeTransactional', () => {
    test('wraps operations in a transaction', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql === 'SELECT gedcom_name FROM wt_gedcom WHERE gedcom_id = $1') {
            return Promise.resolve({ rows: [{ gedcom_name: 'mytree' }] });
          }
          if (sql.includes('DEFAULT_GEDCOM')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.deleteTreeTransactional(pool, 5);

      expect(queries[0].sql).toBe('BEGIN');
      expect(queries[queries.length - 1].sql).toBe('COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(queries.some((q) => q.sql.includes('DELETE FROM wt_individuals'))).toBe(true);
    });

    test('clears DEFAULT_GEDCOM when deleting the default tree', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.includes("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'DEFAULT_GEDCOM'")) {
            return Promise.resolve({ rows: [{ setting_value: 'mytree' }] });
          }
          if (sql.includes('SELECT gedcom_name FROM wt_gedcom WHERE')) {
            return Promise.resolve({ rows: [{ gedcom_name: 'mytree' }] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.deleteTreeTransactional(pool, 5);

      const updateDefault = queries.find((q) => q.sql.includes('UPDATE wt_site_setting') && q.sql.includes('DEFAULT_GEDCOM'));
      expect(updateDefault).toBeDefined();
      expect(updateDefault.sql).toContain("setting_value = ''");
    });

    test('rolls back on error', async () => {
      const client = {
        query: vi.fn().mockRejectedValue(new Error('DB error')),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await expect(treeManagement.deleteTreeTransactional(pool, 5)).rejects.toThrow('DB error');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('hasPendingEdit', () => {
    test('returns true when pending changes exist', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
      const result = await treeManagement.hasPendingEdit(pool, 3);
      expect(result).toBe(true);
    });

    test('returns false when no pending changes', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.hasPendingEdit(pool, 3);
      expect(result).toBe(false);
    });
  });

  describe('duplicateXrefs', () => {
    test('returns a map of xref -> type for duplicates', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I5', type: 'INDI' },
            { xref: 'F3', type: 'FAM' },
          ],
        }),
      };
      const result = await treeManagement.duplicateXrefs(pool, 1);
      expect(result).toEqual({ I5: 'INDI', F3: 'FAM' });
    });

    test('returns empty object when no duplicates', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.duplicateXrefs(pool, 1);
      expect(result).toEqual({});
    });
  });

  describe('mergeTreesTransactional', () => {
    test('wraps copy operations in a transaction', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.mergeTreesTransactional(pool, 1, 2);

      expect(queries[0].sql).toBe('BEGIN');
      expect(queries[queries.length - 1].sql).toBe('COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(queries.some((q) => q.sql.includes('INSERT INTO wt_individuals'))).toBe(true);
    });

    test('includes wt_other with extraWhere clause', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.mergeTreesTransactional(pool, 1, 2);

      const otherQuery = queries.find((q) => q.sql.includes('wt_other') && q.sql.includes("o_type NOT IN"));
      expect(otherQuery).toBeDefined();
    });

    test('rolls back on error', async () => {
      const client = {
        query: vi.fn().mockRejectedValue(new Error('Merge failed')),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await expect(treeManagement.mergeTreesTransactional(pool, 1, 2)).rejects.toThrow('Merge failed');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('loadTreeForPreferences', () => {
    test('returns null when tree not found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.loadTreeForPreferences(pool, 99);
      expect(result).toBeNull();
    });

    test('returns tree data and preferences merged into an object', async () => {
      const pool = {
        query: vi.fn((sql) => {
          if (sql.includes('FROM wt_gedcom WHERE')) {
            return Promise.resolve({ rows: [{ gedcom_id: 1, gedcom_name: 'mytree', title: 'My Tree' }] });
          }
          if (sql.includes('FROM wt_gedcom_setting WHERE')) {
            return Promise.resolve({
              rows: [
                { setting_name: 'CALENDAR_FORMAT', setting_value: 'gregorian' },
                { setting_name: 'SURNAME_TRADITION', setting_value: 'paternal' },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      const result = await treeManagement.loadTreeForPreferences(pool, 1);
      expect(result.row.gedcom_name).toBe('mytree');
      expect(result.preferences.CALENDAR_FORMAT).toBe('gregorian');
      expect(result.preferences.SURNAME_TRADITION).toBe('paternal');
    });
  });

  describe('updateTreePreferences', () => {
    test('writes preferences with calendar format joined by _and_', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({
        title: 'New Title',
        gedcom: 'newtree',
        CALENDAR_FORMAT0: 'gregorian',
        CALENDAR_FORMAT1: 'julian',
        CHART_BOX_TAGS: 'BIRT',
        CONTACT_USER_ID: '5',
      });

      await treeManagement.updateTreePreferences(pool, { gedcomId: 1, isAdmin: true, treeName: 'oldtree', formData });

      const calendarSetting = queries.find((q) => q.params?.[1] === 'CALENDAR_FORMAT');
      expect(calendarSetting.params[2]).toBe('gregorian_and_julian');
    });

    test('detects duplicate tree names and returns duplicateName: true', async () => {
      const client = {
        query: vi.fn((sql) => {
          if (sql.includes('SELECT 1 FROM wt_gedcom WHERE gedcom_name =')) {
            return Promise.resolve({ rows: [{ id: 1 }] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({
        title: 'Title',
        gedcom: 'takenname',
      });

      const result = await treeManagement.updateTreePreferences(pool, {
        gedcomId: 1,
        isAdmin: true,
        treeName: 'oldtree',
        formData,
      });

      expect(result.duplicateName).toBe(true);
    });

    test('returns duplicateName: false when no duplicate', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({ title: 'Title', gedcom: 'uniquename' });

      const result = await treeManagement.updateTreePreferences(pool, {
        gedcomId: 1,
        isAdmin: true,
        treeName: 'oldtree',
        formData,
      });

      expect(result.duplicateName).toBe(false);
    });
  });

  describe('loadPrivacyData', () => {
    test('returns null when tree not found', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeManagement.loadPrivacyData(pool, 99);
      expect(result).toBeNull();
    });

    test('returns tree, preferences, and restrictions', async () => {
      const pool = {
        query: vi.fn((sql) => {
          if (sql.includes('FROM wt_gedcom WHERE')) {
            return Promise.resolve({ rows: [{ gedcom_id: 1, gedcom_name: 'tree', private: 0 }] });
          }
          if (sql.includes('wt_gedcom_setting')) {
            return Promise.resolve({ rows: [{ setting_name: 'HIDE_LIVE_PEOPLE', setting_value: '0' }] });
          }
          if (sql.includes('wt_default_resn')) {
            return Promise.resolve({
              rows: [{ default_resn_id: 1, xref: 'I1', tag_type: 'BIRT', resn: 'confidential' }],
            });
          }
          return Promise.resolve({ rows: [] });
        }),
      };
      const result = await treeManagement.loadPrivacyData(pool, 1);
      expect(result.tree.gedcom_name).toBe('tree');
      expect(result.preferences.HIDE_LIVE_PEOPLE).toBe('0');
      expect(result.restrictions[0].xref).toBe('I1');
    });
  });

  describe('updatePrivacy', () => {
    test('deletes restrictions when delete ids provided', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({
        'delete[]': ['1', '2'],
      });

      await treeManagement.updatePrivacy(pool, { gedcomId: 5, formData });

      const deleteQuery = queries.find((q) => q.sql.includes('DELETE FROM wt_default_resn'));
      expect(deleteQuery).toBeDefined();
    });

    test('adds new restrictions with both xref and tag_type', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({
        'xref[]': 'I5',
        'tag_type[]': 'BIRT',
        'resn[]': 'confidential',
      });

      await treeManagement.updatePrivacy(pool, { gedcomId: 1, formData });

      const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO wt_default_resn'));
      expect(insertQuery).toBeDefined();
      expect(insertQuery.params).toContain('I5');
      expect(insertQuery.params).toContain('BIRT');
    });

    test('adds new restrictions with tag_type only (xref empty)', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({
        'xref[]': '',
        'tag_type[]': 'DEAT',
        'resn[]': 'hidden',
      });

      await treeManagement.updatePrivacy(pool, { gedcomId: 1, formData });

      const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO wt_default_resn'));
      expect(insertQuery.params).toContain(null);
      expect(insertQuery.params).toContain('DEAT');
    });

    test('updates wt_gedcom.private based on REQUIRE_AUTHENTICATION', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      const formData = new URLSearchParams({ REQUIRE_AUTHENTICATION: '1' });

      await treeManagement.updatePrivacy(pool, { gedcomId: 2, formData });

      const privateUpdate = queries.find((q) => q.sql.includes('UPDATE wt_gedcom SET private ='));
      expect(privateUpdate.params[0]).toBe(1);
    });
  });

  describe('checkTreeErrors', () => {
    test('detects dangling xref references', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', gedcom: '0 @I1@ INDI\n1 NAME John /Doe/', type: 'INDI' },
            { xref: 'F1', gedcom: '0 @F1@ FAM\n1 HUSB @I999@', type: 'FAM' },
          ],
        }),
      };
      const result = await treeManagement.checkTreeErrors(pool, 1);
      expect(result.errors.some((e) => e.includes('I999'))).toBe(true);
      expect(result.errors.some((e) => e.includes('does not exist'))).toBe(true);
    });

    test('detects missing back-links (HUSB without FAMS)', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', gedcom: '0 @I1@ INDI\n1 NAME John /Doe/', type: 'INDI' },
            { xref: 'F1', gedcom: '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@', type: 'FAM' },
            { xref: 'I2', gedcom: '0 @I2@ INDI\n1 NAME Jane /Doe/', type: 'INDI' },
          ],
        }),
      };
      const result = await treeManagement.checkTreeErrors(pool, 1);
      expect(result.errors.some((e) => e.includes('does not have a link back'))).toBe(true);
    });

    test('detects too many HUSB records in a family', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'F1', gedcom: '0 @F1@ FAM\n1 HUSB @I1@\n1 HUSB @I2@', type: 'FAM' },
            { xref: 'I1', gedcom: '0 @I1@ INDI', type: 'INDI' },
            { xref: 'I2', gedcom: '0 @I2@ INDI', type: 'INDI' },
          ],
        }),
      };
      const result = await treeManagement.checkTreeErrors(pool, 1);
      expect(result.errors.some((e) => e.includes('HUSB') && e.includes('too many times'))).toBe(true);
    });

    test('allows valid mutual back-links', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', gedcom: '0 @I1@ INDI\n1 NAME John\n1 FAMS @F1@', type: 'INDI' },
            { xref: 'F1', gedcom: '0 @F1@ FAM\n1 HUSB @I1@', type: 'FAM' },
          ],
        }),
      };
      const result = await treeManagement.checkTreeErrors(pool, 1);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('renumberTreeTransactional', () => {
    test('wraps renumbering in a transaction', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.includes("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'next_xref' FOR UPDATE")) {
            return Promise.resolve({ rows: [{ setting_value: '100' }] });
          }
          if (sql.includes('SELECT 1 WHERE EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.renumberTreeTransactional(pool, 1, { I5: 'INDI' });

      expect(queries[0].sql).toBe('BEGIN');
      expect(queries[queries.length - 1].sql).toBe('COMMIT');
      expect(client.release).toHaveBeenCalled();
    });

    test('renumbers individual records with REPLACE expressions', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.includes("FOR UPDATE")) {
            return Promise.resolve({ rows: [{ setting_value: '100' }] });
          }
          if (sql.includes('SELECT 1 WHERE EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.renumberTreeTransactional(pool, 1, { I1: 'INDI' });

      const indiUpdate = queries.find((q) => q.sql.includes('UPDATE wt_individuals SET i_id ='));
      expect(indiUpdate).toBeDefined();
      expect(indiUpdate.sql).toContain('REPLACE');
    });

    test('renumbers source records', async () => {
      const queries = [];
      const client = {
        query: vi.fn((sql, params) => {
          queries.push({ sql, params });
          if (sql.includes("FOR UPDATE")) {
            return Promise.resolve({ rows: [{ setting_value: '100' }] });
          }
          if (sql.includes('SELECT 1 WHERE EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await treeManagement.renumberTreeTransactional(pool, 1, { S1: 'SOUR' });

      const sourUpdate = queries.find((q) => q.sql.includes('UPDATE wt_sources SET s_id ='));
      expect(sourUpdate).toBeDefined();
    });

    test('rolls back on error', async () => {
      const client = {
        query: vi.fn((sql) => {
          if (sql.includes("FOR UPDATE")) {
            return Promise.resolve({ rows: [{ setting_value: '100' }] });
          }
          if (sql.includes('SELECT 1 WHERE EXISTS')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.reject(new Error('Renumber failed'));
        }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };

      await expect(treeManagement.renumberTreeTransactional(pool, 1, { I1: 'INDI' })).rejects.toThrow('Renumber failed');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
