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

// Mirrors app/Http/RequestHandlers/LoginAction.php's doLogin()
// (LoginAction.php:79-115) exactly, including reusing the SAME
// "incorrect" message for both the no-such-user and wrong-password
// cases (don't leak which one failed - matches PHP). Pure DB
// orchestration, no HTTP concerns - the caller (pages-server/index.mjs)
// owns cookies/redirects, same split as account-update.mjs.

import bcrypt from 'bcryptjs';

const MESSAGE_NO_COOKIES = 'You cannot sign in because your browser does not accept cookies.';
const MESSAGE_INCORRECT = 'The username or password is incorrect.';
const MESSAGE_NOT_VERIFIED = 'This account has not been verified. Please check your email for a verification message.';
const MESSAGE_NOT_APPROVED = 'This account has not been approved. Please wait for an administrator to approve it.';

/**
 * Shared with logout.mjs - both write to the same wt_log 'auth' type,
 * matching Log::addAuthenticationLog()'s single call site used for
 * both login and logout messages (app/Log.php:40-43).
 *
 * @param {import('pg').Pool} pool
 * @param {string} message
 * @param {string} clientIp
 * @param {number|null} userId
 */
export async function addAuthenticationLog(pool, message, clientIp, userId) {
  await pool.query('INSERT INTO wt_log (log_time, log_type, log_message, ip_address, user_id) VALUES (now(), $1, $2, $3, $4)', [
    'auth',
    message,
    clientIp,
    userId,
  ]);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{username: string, password: string, clientIp: string, cookiesPresent: boolean}} params
 * @returns {Promise<
 *   {ok: true, userId: number, userName: string, realName: string, language: string, theme: string}
 *   | {ok: false, message: string}
 * >}
 */
export async function doLogin(pool, { username, password, clientIp, cookiesPresent }) {
  if (!cookiesPresent) {
    await addAuthenticationLog(pool, `Login failed (no session cookies): ${username}`, clientIp, null);

    return { ok: false, message: MESSAGE_NO_COOKIES };
  }

  const userResult = await pool.query(
    'SELECT user_id, user_name, real_name, password FROM wt_user WHERE user_name = $1 OR email = $1',
    [username],
  );

  if (userResult.rows.length === 0) {
    await addAuthenticationLog(pool, `Login failed (no such user/email): ${username}`, clientIp, null);

    return { ok: false, message: MESSAGE_INCORRECT };
  }

  const row = userResult.rows[0];

  if (!bcrypt.compareSync(password, row.password)) {
    await addAuthenticationLog(pool, `Login failed (incorrect password): ${username}`, clientIp, null);

    return { ok: false, message: MESSAGE_INCORRECT };
  }

  const settingsResult = await pool.query('SELECT setting_name, setting_value FROM wt_user_setting WHERE user_id = $1', [
    row.user_id,
  ]);

  const settings = {};

  for (const settingRow of settingsResult.rows) {
    settings[settingRow.setting_name] = settingRow.setting_value;
  }

  if (settings.verified !== '1') {
    await addAuthenticationLog(pool, `Login failed (not verified by user): ${username}`, clientIp, null);

    return { ok: false, message: MESSAGE_NOT_VERIFIED };
  }

  if (settings.verified_by_admin !== '1') {
    await addAuthenticationLog(pool, `Login failed (not approved by admin): ${username}`, clientIp, null);

    return { ok: false, message: MESSAGE_NOT_APPROVED };
  }

  await addAuthenticationLog(pool, `Login: ${row.user_name}/${row.real_name}`, clientIp, row.user_id);

  await pool.query(
    `INSERT INTO wt_user_setting (user_id, setting_name, setting_value)
     VALUES ($1, 'sessiontime', $2)
     ON CONFLICT (user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [row.user_id, String(Math.floor(Date.now() / 1000))],
  );

  return {
    ok: true,
    userId: row.user_id,
    userName: row.user_name,
    realName: row.real_name,
    language: settings.language || 'en-US',
    theme: settings.theme || '',
  };
}
