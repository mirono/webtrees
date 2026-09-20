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
import { significantIndividualXref, findVisibleWelcomeBlockId } from '../pages-server/welcome-block.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('significantIndividualXref', () => {
  test("a logged-in user's 'rootid' preference wins when it exists", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return { rows: [{ setting_name: 'rootid', setting_value: 'I5' }] };
      }
      if (sql.includes('wt_individuals WHERE i_id')) {
        return { rows: [{ '?column?': 1 }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBe('I5');
  });

  test("falls through to 'gedcomid' when 'rootid' is absent", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return { rows: [{ setting_name: 'gedcomid', setting_value: 'I7' }] };
      }
      if (sql.includes('wt_individuals WHERE i_id')) {
        return { rows: [{ '?column?': 1 }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBe('I7');
  });

  test("falls through to 'gedcomid' when 'rootid' points at a nonexistent individual", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return {
          rows: [
            { setting_name: 'rootid', setting_value: 'I5' },
            { setting_name: 'gedcomid', setting_value: 'I7' },
          ],
        };
      }
      if (sql.includes('wt_individuals WHERE i_id')) {
        const xref = pool.query.mock.calls.at(-1)[1][0];
        return { rows: xref === 'I7' ? [{ '?column?': 1 }] : [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBe('I7');
  });

  test('an anonymous visitor skips the user-preference lookup entirely', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        throw new Error('should not query user preferences for an anonymous visitor');
      }
      if (sql.includes('PEDIGREE_ROOT_ID')) {
        return { rows: [{ setting_value: 'I1' }] };
      }
      if (sql.includes('wt_individuals WHERE i_id')) {
        return { rows: [{ '?column?': 1 }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: null })).toBe('I1');
  });

  test('falls through to PEDIGREE_ROOT_ID when no user preference resolves', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return { rows: [] };
      }
      if (sql.includes('PEDIGREE_ROOT_ID')) {
        return { rows: [{ setting_value: 'I1' }] };
      }
      if (sql.includes('wt_individuals WHERE i_id')) {
        return { rows: [{ '?column?': 1 }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBe('I1');
  });

  test('falls through to MIN(i_id) when neither user prefs nor PEDIGREE_ROOT_ID resolve', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return { rows: [] };
      }
      if (sql.includes('PEDIGREE_ROOT_ID')) {
        return { rows: [] };
      }
      if (sql.includes('MIN(i_id)')) {
        return { rows: [{ xref: 'I2' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBe('I2');
  });

  test('returns null when the tree has zero individuals', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_user_gedcom_setting')) {
        return { rows: [] };
      }
      if (sql.includes('PEDIGREE_ROOT_ID')) {
        return { rows: [] };
      }
      if (sql.includes('MIN(i_id)')) {
        return { rows: [{ xref: null }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await significantIndividualXref(pool, { gedcomId: 1 }, { userId: 9 })).toBeNull();
  });
});

describe('findVisibleWelcomeBlockId', () => {
  test('returns null when the tree has no configured wt_block row for gedcom_block', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_block')) {
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await findVisibleWelcomeBlockId(pool, { gedcomId: 1, viewerAccessLevel: 2 })).toBeNull();
  });

  test('returns null when the module is disabled, even with a configured block row', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_block')) {
        return { rows: [{ block_id: 42 }] };
      }
      if (sql.includes('FROM wt_module')) {
        return { rows: [{ status: 'disabled' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await findVisibleWelcomeBlockId(pool, { gedcomId: 1, viewerAccessLevel: 2 })).toBeNull();
  });

  test('defaults to visible (access level 2) when there is no privacy override row', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_block')) {
        return { rows: [{ block_id: 42 }] };
      }
      if (sql.includes('FROM wt_module_privacy')) {
        return { rows: [] };
      }
      if (sql.includes('FROM wt_module')) {
        return { rows: [{ status: 'enabled' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await findVisibleWelcomeBlockId(pool, { gedcomId: 1, viewerAccessLevel: 2 })).toBe(42);
  });

  test('a privacy override more restrictive than the viewer hides the block', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_block')) {
        return { rows: [{ block_id: 42 }] };
      }
      // Checked before the broader 'FROM wt_module' match below, since
      // 'FROM wt_module_privacy' contains 'FROM wt_module' as a substring.
      if (sql.includes('FROM wt_module_privacy')) {
        return { rows: [{ access_level: 0 }] };
      }
      if (sql.includes('FROM wt_module')) {
        return { rows: [{ status: 'enabled' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await findVisibleWelcomeBlockId(pool, { gedcomId: 1, viewerAccessLevel: 2 })).toBeNull();
  });

  test('a privacy override less restrictive than (or equal to) the viewer keeps the block visible', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_block')) {
        return { rows: [{ block_id: 42 }] };
      }
      if (sql.includes('FROM wt_module_privacy')) {
        return { rows: [{ access_level: 2 }] };
      }
      if (sql.includes('FROM wt_module')) {
        return { rows: [{ status: 'enabled' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    expect(await findVisibleWelcomeBlockId(pool, { gedcomId: 1, viewerAccessLevel: 2 })).toBe(42);
  });
});
