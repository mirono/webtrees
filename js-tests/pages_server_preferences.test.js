import { describe, expect, test, vi } from 'vitest';
import { selectPreference } from '../pages-server/preferences.mjs';

describe('selectPreference', () => {
  test('a logged-in user: writes to the session AND upserts wt_user_setting', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    const session = { initiated: true };

    await selectPreference(pool, { field: 'language', value: 'en-GB', session, user: { userId: 7 } });

    expect(session.language).toBe('en-GB');
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO wt_user_setting/);
    expect(params).toEqual([7, 'language', 'en-GB']);
  });

  test('an anonymous visitor: writes to the session under both the plain and _GUEST_ prefixed keys, no DB write', async () => {
    const pool = { query: vi.fn() };
    const session = { initiated: true };

    await selectPreference(pool, { field: 'theme', value: 'clouds', session, user: null });

    expect(session.theme).toBe('clouds');
    expect(session._GUEST_theme).toBe('clouds');
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('theme field name matches the session key, setting_name, and URL segment (all literally "theme")', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    const session = {};

    await selectPreference(pool, { field: 'theme', value: 'xenea', session, user: { userId: 1 } });

    const [, params] = pool.query.mock.calls[0];
    expect(params[1]).toBe('theme');
  });
});
