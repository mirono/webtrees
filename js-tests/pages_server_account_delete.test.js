import { describe, expect, test, vi } from 'vitest';
import { deleteAccount } from '../pages-server/account-delete.mjs';

function mockPool(queryImpl) {
  const client = { query: vi.fn(queryImpl), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };

  return { pool, client };
}

describe('deleteAccount', () => {
  test('runs every cleanup step inside BEGIN...COMMIT, then releases the client', async () => {
    const { pool, client } = mockPool(async () => ({ rows: [] }));

    await deleteAccount(pool, 42);

    const sqlCalls = client.query.mock.calls.map(([sql]) => sql);

    expect(sqlCalls[0]).toBe('BEGIN');
    expect(sqlCalls.at(-1)).toBe('COMMIT');
    expect(sqlCalls).toContain('DELETE FROM wt_session WHERE user_id = $1');
    expect(sqlCalls.some((sql) => sql.includes('UPDATE wt_log'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM wt_change'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM wt_block_setting'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM wt_block '))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('wt_user_gedcom_setting'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('wt_user_setting'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM wt_message'))).toBe(true);
    expect(sqlCalls.some((sql) => sql.includes('DELETE FROM wt_user WHERE'))).toBe(true);

    // Every step used the same userId parameter.
    for (const [, params] of client.query.mock.calls) {
      if (params !== undefined) {
        expect(params).toEqual([42]);
      }
    }

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  // The whole reason this file exists instead of faithfully porting
  // UserService::delete(): confirmed live that PHP's version has no
  // transaction, so a failure partway through (e.g. the real FK
  // violation reproduced against the live app) leaves the account
  // half-deleted. This must never happen here.
  test('a failure partway through rolls back every step, releases the client, and rethrows', async () => {
    const { pool, client } = mockPool(async (sql) => {
      if (sql.includes('DELETE FROM wt_block ')) {
        throw new Error('simulated DB failure');
      }
      return { rows: [] };
    });

    await expect(deleteAccount(pool, 42)).rejects.toThrow('simulated DB failure');

    const sqlCalls = client.query.mock.calls.map(([sql]) => sql);

    expect(sqlCalls).toContain('ROLLBACK');
    expect(sqlCalls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
