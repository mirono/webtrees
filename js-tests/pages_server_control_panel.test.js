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
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as controlPanel from '../pages-server/control-panel.mjs';

describe('control-panel.mjs', () => {
  describe('totalIndividualsByTree / totalChangesByTree / count helpers', () => {
    test('maps gedcom_id to a parsed integer count', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ gedcom_id: 1, total: '42' }, { gedcom_id: 2, total: '0' }] }) };

      const result = await controlPanel.totalIndividualsByTree(pool);

      expect(result.get(1)).toBe(42);
      expect(result.get(2)).toBe(0);
      expect(pool.query.mock.calls[0][0]).toContain('wt_individuals');
    });

    test('totalChangesByTree filters on pending status', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ gedcom_id: 1, total: '3' }] }) };

      await controlPanel.totalChangesByTree(pool);

      expect(pool.query.mock.calls[0][0]).toContain("c.status = 'pending'");
    });

    test('totalRepositoriesByTree/totalNotesByTree/totalSubmittersByTree query the right o_type', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await controlPanel.totalRepositoriesByTree(pool);
      expect(pool.query.mock.calls[0][1]).toEqual(['REPO']);

      await controlPanel.totalNotesByTree(pool);
      expect(pool.query.mock.calls[1][1]).toEqual(['NOTE']);

      await controlPanel.totalSubmittersByTree(pool);
      expect(pool.query.mock.calls[2][1]).toEqual(['SUBM']);
    });
  });

  describe('loadAllUsers / loadAdministrators / loadManagers / loadModerators', () => {
    test('maps user rows', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 1, user_name: 'admin', real_name: 'Admin User', email: 'a@example.com' }] }) };

      const result = await controlPanel.loadAllUsers(pool);

      expect(result).toEqual([{ userId: 1, userName: 'admin', realName: 'Admin User', email: 'a@example.com' }]);
    });

    test('loadAdministrators filters on canadmin = 1', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await controlPanel.loadAdministrators(pool);
      expect(pool.query.mock.calls[0][0]).toContain("setting_name = 'canadmin'");
    });

    test('loadManagers/loadModerators query canedit with the right role value', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await controlPanel.loadManagers(pool);
      expect(pool.query.mock.calls[0][1]).toEqual(['admin']);

      await controlPanel.loadModerators(pool);
      expect(pool.query.mock.calls[1][1]).toEqual(['accept']);
    });
  });

  describe('loadUnapproved / loadUnverified', () => {
    test('includes a user with no setting row at all', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: 2, user_name: 'bob', real_name: 'Bob', email: 'bob@example.com' }] }) };

      const result = await controlPanel.loadUnapproved(pool);

      expect(result).toHaveLength(1);
      expect(pool.query.mock.calls[0][1]).toEqual(['verified_by_admin']);
    });

    test('loadUnverified queries the verified flag', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await controlPanel.loadUnverified(pool);
      expect(pool.query.mock.calls[0][1]).toEqual(['verified']);
    });
  });

  describe('recipientTypes', () => {
    test('returns the three static broadcast groups', () => {
      const types = controlPanel.recipientTypes();
      expect(types).toHaveLength(3);
      expect(types.map((t) => t.to)).toEqual(['all', 'never_logged_in', 'last_6mo']);
    });
  });

  describe('loadListModuleUrls', () => {
    test('returns a working URL function only for enabled modules', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { module_name: 'individual_list', status: 'enabled' },
            { module_name: 'submitter_list', status: 'disabled' },
          ],
        }),
      };

      const urls = await controlPanel.loadListModuleUrls(pool);

      expect(urls.individual_list('ophir')).toBe('/tree/ophir/individual-list');
      expect(urls.submitter_list('ophir')).toBeNull();
    });
  });

  describe('loadModuleSummary', () => {
    test('counts enabled/total per category and flags "other" modules', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { module_name: 'ancestors_chart', status: 'enabled' },
            { module_name: 'compact-chart', status: 'disabled' },
            { module_name: 'ckeditor', status: 'enabled' },
            { module_name: 'an-unknown-module', status: 'enabled' },
          ],
        }),
      };

      const summary = await controlPanel.loadModuleSummary(pool);

      expect(summary.counts.chart).toEqual({ enabled: 1, total: 2 });
      expect(summary.allEnabled).toBe(2);
      expect(summary.allTotal).toBe(3);
      expect(summary.otherModules).toEqual([{ name: 'ckeditor', title: 'CKEditor™', enabled: true }]);
      // "an-unknown-module" is in the DB but not in MODULE_CATEGORIES
      // (i.e. not a real core module class) - a deleted module, same
      // as ModuleService::deletedModules()'s own "DB minus disk" diff.
      expect(summary.deletedModules).toEqual(['an-unknown-module']);
    });

    test('deletedModules lists DB rows with no known module_name', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ module_name: 'some_removed_module', status: 'enabled' }] }) };

      const summary = await controlPanel.loadModuleSummary(pool);

      expect(summary.deletedModules).toEqual(['some_removed_module']);
      expect(summary.allTotal).toBe(0);
    });
  });

  describe('findOldWebtreesFiles', () => {
    test('finds an existing legacy file but not a missing one', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'wt-housekeeping-'));
      try {
        await writeFile(path.join(dir, 'client.php'), 'legacy');

        const found = await controlPanel.findOldWebtreesFiles(dir);

        expect(found).toEqual(['client.php']);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    test('returns an empty list when none of the legacy paths exist', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'wt-housekeeping-'));
      try {
        const found = await controlPanel.findOldWebtreesFiles(dir);
        expect(found).toEqual([]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
