import { describe, expect, test, vi } from 'vitest';
import { doLogout } from '../pages-server/logout.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('doLogout', () => {
  // Real PHP behavior, confirmed by reading LoginAction.php/Logout.php:
  // logging out while already anonymous is a complete no-op - no log
  // write, no session touched at all.
  test('anonymous user: does nothing, returns false', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    const destroyed = await doLogout(pool, { sessionId: 'abc123', user: null, clientIp: '127.0.0.1' });

    expect(destroyed).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('logged-in user: writes the logout auth log then destroys the session, returns true', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    const user = { userId: 7, userName: 'mirono', realName: 'Miron Ophir' };

    const destroyed = await doLogout(pool, { sessionId: 'abc123', user, clientIp: '127.0.0.1' });

    expect(destroyed).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(2);

    const [logSql, logParams] = pool.query.mock.calls[0];
    expect(logSql).toMatch(/INSERT INTO wt_log/);
    expect(logParams).toEqual(['auth', 'Logout: mirono/Miron Ophir', '127.0.0.1', 7]);

    const [deleteSql, deleteParams] = pool.query.mock.calls[1];
    expect(deleteSql).toMatch(/DELETE FROM wt_session/);
    expect(deleteParams).toEqual(['abc123']);
  });
});
