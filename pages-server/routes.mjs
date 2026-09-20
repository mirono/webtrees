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
