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

// Pure route-matching, split out from index.mjs so it's testable
// without a real HTTP server - same convention as
// proxy/routing.mjs's isNodeRoute().

/**
 * PHP's own route is `/my-account{/tree}` (app/Http/Routes/WebRoutes.php)
 * - an optional trailing tree-name segment, present on the real link
 * whenever the user was browsing a tree when they clicked "My account"
 * (app/Module/ModuleThemeTrait.php::menuMyAccount() always passes the
 * current tree). This step's deliberate scope is "no-tree variant
 * only" (see docs/php-to-js-migration/phase5-first-node-route.md) -
 * meaning the 2 tree-scoped display fields (default individual, its
 * xref) are skipped, NOT that a URL carrying a tree segment should be
 * rejected. Confirmed live: a real logged-in user with any tree at all
 * hits /my-account/<tree-name> for the ordinary "My account" link, so
 * an exact-match-only check 404s the common case, not an edge case.
 * Accept and ignore the segment instead, matching proxy/routing.mjs's
 * isNodeRoute() which already forwards this shape here.
 *
 * @param {string} pathname
 */
export function isMyAccountPath(pathname) {
  return pathname === '/my-account' || pathname.startsWith('/my-account/');
}

/**
 * Same shape as isMyAccountPath() above, for PHP's `/login{/tree}`
 * route (app/Http/Routes/WebRoutes.php) - the tree segment is accepted
 * and ignored, same "no-tree variant only" scope decision.
 *
 * @param {string} pathname
 */
export function isLoginPath(pathname) {
  return pathname === '/login' || pathname.startsWith('/login/');
}

/**
 * PHP's route is a plain `/logout` (app/Http/Routes/WebRoutes.php) -
 * no optional tree segment, unlike /my-account and /login.
 *
 * @param {string} pathname
 */
export function isLogoutPath(pathname) {
  return pathname === '/logout';
}

/**
 * PHP's route is a plain `/my-account-delete` (app/Http/Routes/WebRoutes.php)
 * - no optional tree segment.
 *
 * @param {string} pathname
 */
export function isAccountDeletePath(pathname) {
  return pathname === '/my-account-delete';
}

/**
 * PHP's route is a plain `/` (app/Http/Routes/WebRoutes.php:
 * `$router->get(HomePage::class, '/');`).
 *
 * @param {string} pathname
 */
export function isHomePath(pathname) {
  return pathname === '/';
}

/**
 * PHP's route is `/language/{language}` (app/Http/Routes/WebRoutes.php)
 * - a MANDATORY trailing value segment (unlike the optional {tree}
 * segments above). Returns the raw value (URL.pathname already
 * percent-decodes it) or null if the path doesn't match at all.
 *
 * @param {string} pathname
 * @returns {string|null}
 */
export function matchLanguagePath(pathname) {
  if (!pathname.startsWith('/language/')) {
    return null;
  }

  const value = pathname.slice('/language/'.length);

  // PHP's {language} token is mandatory - a trailing slash with
  // nothing after it doesn't match the real route at all.
  return value === '' ? null : value;
}

/**
 * Same shape as matchLanguagePath() above, for PHP's `/theme/{theme}`
 * route.
 *
 * @param {string} pathname
 * @returns {string|null}
 */
export function matchThemePath(pathname) {
  if (!pathname.startsWith('/theme/')) {
    return null;
  }

  const value = pathname.slice('/theme/'.length);

  return value === '' ? null : value;
}

/**
 * PHP's route is an EXACT match on `/tree/{tree}` - TreePage registers
 * at '' inside `$router->attach('', '/tree/{tree}', ...)`
 * (app/Http/Routes/WebRoutes.php) - NOT a prefix. Sibling routes under
 * the same attach block (`/tree/{tree}/individual/{xref}`,
 * `/tree/{tree}/my-page`, etc.) must NOT match here; they stay
 * PHP-routed. This is why this route needs its own matcher shape
 * rather than reusing the isXPath()/matchXPath() prefix conventions
 * above.
 *
 * @param {string} pathname
 * @returns {string|null} the tree name, or null if this isn't a tree-page request
 */
export function matchTreePagePath(pathname) {
  const match = /^\/tree\/([^/]+)\/?$/.exec(pathname);

  return match ? decodeURIComponent(match[1]) : null;
}
