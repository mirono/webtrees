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

// Identifies the logged-in user from PHP's own session - the key unlock
// for this whole step (see docs/php-to-js-migration/phase5-first-node-route.md):
// webtrees already stores sessions in the database (app/SessionDatabaseHandler.php),
// and user_id is its own column on that table, not buried inside the
// PHP-serialized session_data blob (app/SessionDatabaseHandler.php:61-73,
// golden/postgres-schema.sql's wt_session definition). So identifying
// the user needs nothing PHP-specific - just the raw session cookie
// value and a plain SQL lookup - no PHP session-deserialization
// required at all.

// Same two cookie names PHP's Session class uses (app/Session.php:51-52):
// plain over HTTP, __Secure- prefixed over HTTPS.
const SESSION_COOKIE_NAMES = ['WT2_SESSION', '__Secure-WT-ID'];

/**
 * @param {string|undefined} cookieHeader
 * @returns {Record<string, string>}
 */
export function parseCookies(cookieHeader) {
  const cookies = {};

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

/**
 * Looks up the logged-in user from the session cookie, via the shared
 * wt_session table. Returns null if there's no session cookie, no
 * matching session row, or the session belongs to a guest
 * (SessionDatabaseHandler::write() stores (int) Auth::id(), which is 0
 * for a guest, since wt_session.user_id is NOT NULL and Auth::id()
 * returns null when not logged in).
 *
 * @param {string|undefined} cookieHeader
 * @param {import('pg').Pool} pool
 * @returns {Promise<{userId: number, userName: string, realName: string, email: string, settings: Record<string,string>}|null>}
 */
export async function getCurrentUser(cookieHeader, pool) {
  const cookies = parseCookies(cookieHeader);
  const sessionId = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find((value) => value !== undefined);

  if (!sessionId) {
    return null;
  }

  const sessionResult = await pool.query('SELECT user_id FROM wt_session WHERE session_id = $1', [sessionId]);

  if (sessionResult.rows.length === 0 || !sessionResult.rows[0].user_id) {
    return null;
  }

  const userId = sessionResult.rows[0].user_id;

  const userResult = await pool.query(
    'SELECT user_id, user_name, real_name, email FROM wt_user WHERE user_id = $1',
    [userId],
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const settingsResult = await pool.query(
    'SELECT setting_name, setting_value FROM wt_user_setting WHERE user_id = $1',
    [userId],
  );

  const settings = {};

  for (const row of settingsResult.rows) {
    settings[row.setting_name] = row.setting_value;
  }

  const row = userResult.rows[0];

  return {
    userId: row.user_id,
    userName: row.user_name,
    realName: row.real_name,
    email: row.email,
    settings,
  };
}
