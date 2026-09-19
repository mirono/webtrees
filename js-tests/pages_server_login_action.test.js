import { describe, expect, test, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { doLogin } from '../pages-server/login-action.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

const BASE_PARAMS = { username: 'mirono', password: 'correct-password', clientIp: '127.0.0.1' };

describe('doLogin', () => {
  test('no cookies present: fails immediately, logs, never queries wt_user', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: false });

    expect(result).toEqual({ ok: false, message: 'You cannot sign in because your browser does not accept cookies.' });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toMatch(/INSERT INTO wt_log/);
    expect(pool.query.mock.calls[0][1]).toEqual(['auth', 'Login failed (no session cookies): mirono', '127.0.0.1', null]);
  });

  test('no such user/email: generic "incorrect" message', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result).toEqual({ ok: false, message: 'The username or password is incorrect.' });
  });

  test('wrong password: same generic "incorrect" message as no-such-user (does not leak which failed)', async () => {
    const hash = bcrypt.hashSync('a-different-password', 10);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [{ user_id: 1, user_name: 'mirono', real_name: 'Miron Ophir', password: hash }] };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result).toEqual({ ok: false, message: 'The username or password is incorrect.' });
  });

  test('not verified: distinct message', async () => {
    const hash = bcrypt.hashSync(BASE_PARAMS.password, 10);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [{ user_id: 1, user_name: 'mirono', real_name: 'Miron Ophir', password: hash }] };
      }
      if (sql.includes('FROM wt_user_setting')) {
        return { rows: [{ setting_name: 'verified_by_admin', setting_value: '1' }] };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result).toEqual({
      ok: false,
      message: 'This account has not been verified. Please check your email for a verification message.',
    });
  });

  test('not approved by admin: distinct message', async () => {
    const hash = bcrypt.hashSync(BASE_PARAMS.password, 10);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [{ user_id: 1, user_name: 'mirono', real_name: 'Miron Ophir', password: hash }] };
      }
      if (sql.includes('FROM wt_user_setting')) {
        return { rows: [{ setting_name: 'verified', setting_value: '1' }] };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result).toEqual({
      ok: false,
      message: 'This account has not been approved. Please wait for an administrator to approve it.',
    });
  });

  test('success: returns user info and language/theme defaults, writes success log + sessiontime upsert', async () => {
    const hash = bcrypt.hashSync(BASE_PARAMS.password, 10);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [{ user_id: 7, user_name: 'mirono', real_name: 'Miron Ophir', password: hash }] };
      }
      if (sql.includes('FROM wt_user_setting')) {
        return {
          rows: [
            { setting_name: 'verified', setting_value: '1' },
            { setting_name: 'verified_by_admin', setting_value: '1' },
            { setting_name: 'language', setting_value: 'en-GB' },
            { setting_name: 'theme', setting_value: 'clouds' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result).toEqual({
      ok: true,
      userId: 7,
      userName: 'mirono',
      realName: 'Miron Ophir',
      language: 'en-GB',
      theme: 'clouds',
    });

    const insertCalls = pool.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO wt_log'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(['auth', 'Login: mirono/Miron Ophir', '127.0.0.1', 7]);

    const sessiontimeCall = pool.query.mock.calls.find(([sql]) => sql.includes("'sessiontime'"));
    expect(sessiontimeCall).toBeDefined();
    expect(sessiontimeCall[1][0]).toBe(7);
  });

  test('success with no language/theme settings defaults language to en-US and theme to empty string', async () => {
    const hash = bcrypt.hashSync(BASE_PARAMS.password, 10);
    const pool = mockPool(async (sql) => {
      if (sql.includes('FROM wt_user WHERE')) {
        return { rows: [{ user_id: 7, user_name: 'mirono', real_name: 'Miron Ophir', password: hash }] };
      }
      if (sql.includes('FROM wt_user_setting')) {
        return {
          rows: [
            { setting_name: 'verified', setting_value: '1' },
            { setting_name: 'verified_by_admin', setting_value: '1' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, cookiesPresent: true });

    expect(result.ok).toBe(true);
    expect(result.language).toBe('en-US');
    expect(result.theme).toBe('');
  });

  test('finds a user by email as well as by username (WHERE user_name = $1 OR email = $1)', async () => {
    const hash = bcrypt.hashSync(BASE_PARAMS.password, 10);
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('FROM wt_user WHERE')) {
        expect(params).toEqual(['someone@example.com']);
        return { rows: [{ user_id: 3, user_name: 'someone', real_name: 'Some One', password: hash }] };
      }
      if (sql.includes('FROM wt_user_setting')) {
        return {
          rows: [
            { setting_name: 'verified', setting_value: '1' },
            { setting_name: 'verified_by_admin', setting_value: '1' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await doLogin(pool, { ...BASE_PARAMS, username: 'someone@example.com', cookiesPresent: true });

    expect(result.ok).toBe(true);
    expect(result.userName).toBe('someone');
  });
});
