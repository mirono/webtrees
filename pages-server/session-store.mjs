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

// Reads and writes wt_session for /login - the one pages-server/ route
// that must CREATE a session PHP will recognize, not just read one PHP
// already wrote (unlike /my-account, see auth.mjs). Mirrors
// app/Session.php + app/SessionDatabaseHandler.php's actual behavior,
// verified against real PHP (session_encode()/session_decode()
// byte-for-byte matched php-serialize.mjs's output - see that file's
// own doc comment).

import { randomBytes } from 'node:crypto';
import { parseCookies, SESSION_COOKIE_NAMES } from './auth.mjs';
import { decodePhpSession, encodePhpSession } from './php-serialize.mjs';

function newSessionId() {
  // A hex string (0-9a-f) is a valid subset of every possible PHP
  // session.sid_bits_per_character (4, 5, or 6 bits/char) - sidesteps
  // needing to know the running php.ini's exact setting.
  // SessionDatabaseHandler doesn't validate the ID's format (see
  // read()/write() in that file), only that it's a string, so any
  // sufficiently random value would technically work - hex is chosen
  // to also look like a value PHP itself could have generated.
  return randomBytes(24).toString('hex');
}

export function newCsrfToken() {
  return randomBytes(24).toString('hex');
}

/**
 * Finds the session cookie PHP itself would look for, from either of
 * the two names app/Session.php:51-52 uses.
 *
 * @param {Record<string,string>} cookies
 * @returns {string|undefined}
 */
export function findSessionCookieValue(cookies) {
  return SESSION_COOKIE_NAMES.map((name) => cookies[name]).find((value) => value !== undefined);
}

/**
 * Loads the session the request's cookie points at, or creates a fresh
 * anonymous one (user_id=0, matching (int) Auth::id() for a guest) if
 * there's no cookie, no matching row, or the row's session_data can't
 * be decoded (a stale/foreign session carrying a value type this codec
 * doesn't model - see php-serialize.mjs's UnsupportedPhpValueTypeError).
 * Mirrors app/Session.php:57-87's "new session" branch: `initiated:
 * true` + a fresh CSRF token, matching Session::start()'s
 * regenerate(true) + put('initiated', true) + the lazy
 * getCsrfToken() a GET /login would otherwise trigger separately.
 *
 * @param {string|undefined} cookieHeader
 * @param {string} clientIp
 * @param {import('pg').Pool} pool
 * @returns {Promise<{sessionId: string, session: Record<string, unknown>, isNew: boolean}>}
 */
export async function loadOrCreateAnonymousSession(cookieHeader, clientIp, pool) {
  const cookies = parseCookies(cookieHeader);
  const cookieValue = findSessionCookieValue(cookies);

  if (cookieValue !== undefined) {
    const result = await pool.query('SELECT session_data FROM wt_session WHERE session_id = $1', [cookieValue]);

    if (result.rows.length > 0) {
      try {
        const session = decodePhpSession(result.rows[0].session_data);

        return { sessionId: cookieValue, session, isNew: false };
      } catch {
        // Unreadable session_data (see the doc comment above) - fall
        // through to starting a fresh anonymous session, same as if
        // there had been no matching row at all.
      }
    }
  }

  const sessionId = newSessionId();
  const session = { initiated: true, CSRF_TOKEN: newCsrfToken() };

  await pool.query(
    'INSERT INTO wt_session (session_id, session_time, user_id, ip_address, session_data) VALUES ($1, now(), 0, $2, $3)',
    [sessionId, clientIp, encodePhpSession(session)],
  );

  return { sessionId, session, isNew: true };
}

/**
 * Persists an in-place-updated `session` object back to its existing
 * row - used for the GET /login lazy-CSRF-token-write case, matching
 * Session::getCsrfToken()'s own "generate and save even on a GET"
 * behavior (app/Session.php:173-186).
 *
 * @param {string} sessionId
 * @param {Record<string, unknown>} session
 * @param {import('pg').Pool} pool
 */
export async function saveSession(sessionId, session, pool) {
  await pool.query('UPDATE wt_session SET session_data = $1 WHERE session_id = $2', [
    encodePhpSession(session),
    sessionId,
  ]);
}

/**
 * The successful-login step: mirrors Auth::login() -> Session::regenerate()
 * with $destroy=false - a NEW session ID is issued, but the session's
 * existing data (CSRF_TOKEN, initiated) carries over unchanged, with
 * `wt_user` added. The OLD session_id's row is deliberately left in
 * place, untouched - real PHP's session_regenerate_id(false) never
 * deletes the old row synchronously either; it's left for
 * SessionDatabaseHandler::gc(). Replicating an immediate delete here
 * would be MORE aggressive than PHP itself, not a bug fix.
 *
 * Known, accepted race: no locking around this read-then-write (PHP's
 * own SessionDatabaseHandler has the same gap, no flock-equivalent) -
 * two near-simultaneous login POSTs on the same old session both
 * succeed with distinct new session IDs; the last Set-Cookie the
 * browser keeps wins, and one extra harmless orphaned row is created.
 *
 * @param {Record<string, unknown>} session mutated in place with wt_user added
 * @param {number} userId
 * @param {string} clientIp
 * @param {import('pg').Pool} pool
 * @returns {Promise<{newSessionId: string}>}
 */
export async function regenerateSessionForLogin(session, userId, clientIp, pool) {
  const newSessionIdValue = newSessionId();

  session.wt_user = userId;

  await pool.query(
    'INSERT INTO wt_session (session_id, session_time, user_id, ip_address, session_data) VALUES ($1, now(), $2, $3, $4)',
    [newSessionIdValue, userId, clientIp, encodePhpSession(session)],
  );

  return { newSessionId: newSessionIdValue };
}

/**
 * Deletes a session row outright - mirrors SessionDatabaseHandler::destroy()
 * (app/SessionDatabaseHandler.php:105-112), invoked by
 * Auth::logout() -> Session::regenerate($destroy=true).
 *
 * @param {string} sessionId
 * @param {import('pg').Pool} pool
 */
export async function destroySession(sessionId, pool) {
  await pool.query('DELETE FROM wt_session WHERE session_id = $1', [sessionId]);
}

/**
 * @param {boolean} secure
 * @param {string} sessionId
 * @returns {string} a Set-Cookie header value
 */
export function sessionSetCookieHeader(secure, sessionId) {
  const name = secure ? '__Secure-WT-ID' : 'WT2_SESSION';
  const secureAttr = secure ? '; Secure' : '';

  return `${name}=${sessionId}; Path=/; HttpOnly; SameSite=Lax${secureAttr}`;
}

/**
 * Clears the session cookie client-side (Max-Age=0) - hygiene on top
 * of destroySession()'s server-side row deletion, so the browser isn't
 * left holding a reference to an already-deleted session_id. Real PHP
 * doesn't bother with this explicitly (session_regenerate_id()
 * transparently issues a fresh Set-Cookie for whatever new ID it
 * assigns instead), but there's no equivalent "assign a replacement"
 * step here worth replicating - see logout.mjs's doc comment.
 *
 * @param {boolean} secure
 * @returns {string} a Set-Cookie header value
 */
export function sessionClearCookieHeader(secure) {
  const name = secure ? '__Secure-WT-ID' : 'WT2_SESSION';
  const secureAttr = secure ? '; Secure' : '';

  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureAttr}`;
}
