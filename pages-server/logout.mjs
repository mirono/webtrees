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

// Mirrors app/Http/RequestHandlers/Logout.php exactly - including a
// detail that's easy to miss: PHP only touches the session AT ALL
// (log + destroy) inside `if ($user instanceof User)`. Hitting
// /logout while already anonymous is a complete no-op on the PHP
// side - no session write, no log entry. This function replicates
// that precisely: destroySession() only runs when a real user was
// logged in, matching Auth::logout() -> Session::regenerate(true)
// (which clears $_SESSION and destroys the OLD session row via
// session_regenerate_id($destroy=true) calling the handler's
// destroy() - unlike login's regenerate(false), which deliberately
// leaves the old row in place). Pure DB orchestration, no HTTP
// concerns - same split as login-action.mjs/account-update.mjs.

import { addAuthenticationLog } from './login-action.mjs';
import { destroySession } from './session-store.mjs';

/**
 * @param {import('pg').Pool} pool
 * @param {{sessionId: string, user: {userId: number, userName: string, realName: string}|null, clientIp: string}} params
 * @returns {Promise<boolean>} true if a session was actually destroyed
 */
export async function doLogout(pool, { sessionId, user, clientIp }) {
  if (user === null) {
    return false;
  }

  await addAuthenticationLog(pool, `Logout: ${user.userName}/${user.realName}`, clientIp, user.userId);
  await destroySession(sessionId, pool);

  return true;
}
