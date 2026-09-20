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

// A self-contained double-submit-cookie CSRF check for pages-server/'s
// own forms - deliberately NOT sharing PHP's CheckCsrf/Session::getCsrfToken()
// mechanism (app/Http/Middleware/CheckCsrf.php, app/Session.php:173-186).
// That token lives *inside* the PHP-serialized session_data blob, not
// its own column (unlike wt_session.user_id, which auth.mjs reads
// directly) - reading it would mean parsing PHP's legacy
// session.serialize_handler=php format for one string, for a token
// whose only consumer would be this same server. CSRF protection
// doesn't need to be shared across runtimes, only login identity does
// (which already is, via wt_session.user_id) - see
// docs/php-to-js-migration/phase5-first-node-route.md for the full
// reasoning. This is a deliberate scope decision, not an oversight.

import { randomBytes } from 'node:crypto';

const CSRF_COOKIE_NAME = 'wt_node_csrf';

export function generateCsrfToken() {
  return randomBytes(24).toString('hex');
}

export function csrfSetCookieHeader(token) {
  // Path=/ , not Path=/my-account: cookie-path matching (RFC 6265
  // 5.1.4) only sends a Path=/my-account cookie for a request path
  // that is EXACTLY /my-account, or has /my-account/ as a prefix - a
  // POST to /my-account-delete would NOT include it (no "/" right
  // after "/my-account"), silently breaking CSRF validation there.
  // Confirmed by reading the RFC's matching algorithm before this bug
  // could ship, not found live. The token itself is regenerated fresh
  // on every GET anyway, so there's no meaningful downside to the
  // broader scope.
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * @param {Record<string,string>} cookies
 * @param {string|null} formToken
 */
export function isValidCsrf(cookies, formToken) {
  const cookieToken = cookies[CSRF_COOKIE_NAME];

  return typeof cookieToken === 'string' && cookieToken !== '' && cookieToken === formToken;
}
