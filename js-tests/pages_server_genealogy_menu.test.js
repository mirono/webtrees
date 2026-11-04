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
import { buildGenealogyMenu } from '../pages-server/genealogy-menu.mjs';

const ALL_ENABLED_MODULES = [
  'trees-menu',
  'charts-menu',
  'lists-menu',
  'calendar-menu',
  'reports-menu',
  'search-menu',
  'ancestors_chart',
  'compact-chart',
  'descendancy_chart',
  'family_book_chart',
  'fan_chart',
  'hourglass_chart',
  'lifespans_chart',
  'pedigree_chart',
  'pedigree-map',
  'relationships_chart',
  'statistics_chart',
  'timeline_chart',
  'tree',
  'branches_list',
  'family_list',
  'individual_list',
  'location_list',
  'media_list',
  'note_list',
  'repository_list',
  'source_list',
  'submitter_list',
  'ahnentafel_report',
  'bdm_report',
  'birth_report',
  'cemetery_report',
  'change_report',
  'death_report',
  'descendancy_report',
  'fact_sources',
  'family_group_report',
  'individual_ext_report',
  'individual_report',
  'marriage_report',
  'missing_facts_report',
  'occupation_report',
  'pedigree_report',
  'relative_ext_report',
];

function mockPool({ enabledModules, privacyOverrides = {}, oneTree = true, individualExists = true, significantXref = 'I1' }) {
  return {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('FROM wt_module WHERE module_name')) {
        return { rows: enabledModules.map((name) => ({ module_name: name, status: 'enabled' })) };
      }
      if (sql.includes('FROM wt_module_privacy')) {
        return {
          rows: Object.entries(privacyOverrides).map(([module_name, access_level]) => ({ module_name, access_level })),
        };
      }
      if (sql.includes('FROM wt_gedcom')) {
        return oneTree
          ? { rows: [{ gedcom_id: 1, gedcom_name: 'ophir', title: 'Ophir', imported: 1, private: 0 }] }
          : {
              rows: [
                { gedcom_id: 1, gedcom_name: 'ophir', title: 'Ophir', imported: 1, private: 0 },
                { gedcom_id: 2, gedcom_name: 'other', title: 'Other', imported: 1, private: 0 },
              ],
            };
      }
      if (sql.includes('FROM wt_individuals WHERE i_id')) {
        return individualExists ? { rows: [{ i_id: params[0], i_gedcom: '0 @I1@ INDI' }] } : { rows: [] };
      }
      if (sql.includes('MIN(i_id)')) {
        return { rows: [{ xref: significantXref }] };
      }
      if (sql.includes('wt_user_gedcom_setting') || sql.includes('PEDIGREE_ROOT_ID')) {
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
}

const tree = { gedcomId: 1, name: 'ophir' };

describe('buildGenealogyMenu', () => {
  test('a full stock install returns all six menus in order', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: 9, isAdmin: false, accessLevel: 1, xrefParam: 'I1' });

    expect(menus.map((m) => m.label)).toEqual(['Family tree', 'Charts', 'Lists', 'Calendar', 'Reports', 'Search']);
  });

  test('Family tree is a plain link when there is only one tree', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const treeMenu = menus.find((m) => m.class === 'menu-tree');
    expect(treeMenu.submenus).toEqual([]);
    expect(treeMenu.link).toBe('/tree/ophir');
  });

  test('Family trees becomes a dropdown with multiple trees', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES, oneTree: false });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const treeMenu = menus.find((m) => m.class === 'menu-tree');
    expect(treeMenu.submenus).toHaveLength(2);
    expect(treeMenu.submenus.map((s) => s.label)).toEqual(['Ophir', 'Other']);
  });

  test('a disabled chart module is missing from the Charts submenu', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES.filter((m) => m !== 'fan_chart') });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const charts = menus.find((m) => m.class === 'menu-chart');
    expect(charts.submenus.some((s) => s.label === 'Fan chart')).toBe(false);
    expect(charts.submenus.some((s) => s.label === 'Ancestors')).toBe(true);
  });

  test('the whole Charts menu disappears when charts-menu itself is disabled', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES.filter((m) => m !== 'charts-menu') });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    expect(menus.some((m) => m.class === 'menu-chart')).toBe(false);
  });

  test('a visitor (accessLevel 2) does not see a member-only module (e.g. Sources list, level 1)', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const lists = menus.find((m) => m.class === 'menu-list');
    expect(lists.submenus.some((s) => s.label === 'Sources')).toBe(false);
    expect(lists.submenus.some((s) => s.label === 'Individuals')).toBe(true);
  });

  test('a member (accessLevel 1) does see Sources, and gets Search and replace', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: 9, isAdmin: false, accessLevel: 1, xrefParam: 'I1' });

    const lists = menus.find((m) => m.class === 'menu-list');
    expect(lists.submenus.some((s) => s.label === 'Sources')).toBe(true);

    const search = menus.find((m) => m.class === 'menu-search');
    expect(search.submenus.some((s) => s.label === 'Search and replace')).toBe(true);
  });

  test('a visitor does not get Search and replace', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const search = menus.find((m) => m.class === 'menu-search');
    expect(search.submenus.some((s) => s.label === 'Search and replace')).toBe(false);
  });

  test('Calendar keeps its fixed Day/Month/Year order', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: 9, isAdmin: false, accessLevel: 1, xrefParam: 'I1' });

    const calendar = menus.find((m) => m.class === 'menu-calendar');
    expect(calendar.submenus.map((s) => s.label)).toEqual(['Day', 'Month', 'Year']);
  });

  test('Calendar is hidden from a visitor - CalendarMenuModule defaults to Auth::PRIV_USER (member-only)', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    expect(menus.some((m) => m.class === 'menu-calendar')).toBe(false);
  });

  test('Charts submenu items are sorted alphabetically', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const charts = menus.find((m) => m.class === 'menu-chart');
    const labels = charts.submenus.map((s) => s.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  test('an invalid xref query param falls back to the significant individual', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES, individualExists: false, significantXref: 'I7' });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I999' });

    const charts = menus.find((m) => m.class === 'menu-chart');
    const ancestors = charts.submenus.find((s) => s.label === 'Ancestors');
    expect(ancestors.link).toBe('/tree/ophir/ancestors-tree-4/I7');
  });

  test('an explicit module_privacy override wins over the class default', async () => {
    const pool = mockPool({ enabledModules: ALL_ENABLED_MODULES, privacyOverrides: { fan_chart: 0 } });

    const menus = await buildGenealogyMenu(pool, { tree, userId: null, isAdmin: false, accessLevel: 2, xrefParam: 'I1' });

    const charts = menus.find((m) => m.class === 'menu-chart');
    expect(charts.submenus.some((s) => s.label === 'Fan chart')).toBe(false);
  });
});
