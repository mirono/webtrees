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
import { buildLeafletJsConfig } from '../pages-server/leaflet-config.mjs';

describe('buildLeafletJsConfig', () => {
  test('returns an OpenStreetMap-only config when that module is enabled', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ status: 'enabled' }] }) };

    const config = await buildLeafletJsConfig(pool);

    expect(config.mapProviders).toHaveLength(1);
    expect(config.mapProviders[0].label).toBe('OpenStreetMap™');
    expect(config.mapProviders[0].children).toHaveLength(3);
    expect(config.mapProviders[0].children[0].default).toBe(true);
    expect(config.icons.collapse).toContain('wt-icon-collapse');
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("module_name = 'openstreetmap'"), []);
  });

  test('returns null when no map provider module is enabled', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ status: 'disabled' }] }) };

    const config = await buildLeafletJsConfig(pool);

    expect(config).toBeNull();
  });

  test('returns null when the module row is missing entirely', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    const config = await buildLeafletJsConfig(pool);

    expect(config).toBeNull();
  });
});
