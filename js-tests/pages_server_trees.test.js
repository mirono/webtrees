import { describe, expect, test, vi } from 'vitest';
import { accessibleTrees, isTreeManager } from '../pages-server/trees.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('accessibleTrees', () => {
  test('an administrator gets every tree with a single, unfiltered query', async () => {
    const pool = mockPool(async (sql) => {
      expect(sql).toContain('WHERE gedcom_id > 0');
      expect(sql).not.toContain('JOIN');
      return { rows: [{ gedcom_id: 1, gedcom_name: 'ophir', imported: 1, private: 0 }] };
    });

    const trees = await accessibleTrees(pool, { userId: 1, isAdmin: true });

    expect(trees).toEqual([{ gedcomId: 1, name: 'ophir', imported: true, private: false }]);
  });

  test('a non-admin gets the privacy-filtered, joined query with their userId as a parameter', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('LEFT JOIN wt_user_gedcom_setting');
      expect(sql).toContain("setting_value = 'admin'");
      expect(sql).toContain("setting_value <> 'none'");
      expect(params).toEqual([5]);
      return { rows: [] };
    });

    await accessibleTrees(pool, { userId: 5, isAdmin: false });
  });

  test('an anonymous visitor (userId null) still runs the filtered query, never the admin one', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('LEFT JOIN wt_user_gedcom_setting');
      expect(params).toEqual([null]);
      return { rows: [] };
    });

    await accessibleTrees(pool, { userId: null, isAdmin: false });
  });

  test('maps imported/private integer columns to booleans', async () => {
    const pool = mockPool(async () => ({
      rows: [{ gedcom_id: 2, gedcom_name: 'foo', imported: 0, private: 1 }],
    }));

    const trees = await accessibleTrees(pool, { userId: 1, isAdmin: true });

    expect(trees).toEqual([{ gedcomId: 2, name: 'foo', imported: false, private: true }]);
  });
});

describe('isTreeManager', () => {
  test('an administrator is always a manager, no query needed', async () => {
    const pool = mockPool(() => {
      throw new Error('should not be called for an admin');
    });

    expect(await isTreeManager(pool, { gedcomId: 1, userId: 1, isAdmin: true })).toBe(true);
  });

  test('a non-admin with a matching admin-role row is a manager', async () => {
    const pool = mockPool(async () => ({ rows: [{ '?column?': 1 }] }));

    expect(await isTreeManager(pool, { gedcomId: 1, userId: 5, isAdmin: false })).toBe(true);
  });

  test('a non-admin with no matching row is not a manager', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await isTreeManager(pool, { gedcomId: 1, userId: 5, isAdmin: false })).toBe(false);
  });
});
