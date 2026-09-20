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

// Pure routing-decision logic, split out from index.mjs so it's
// testable without a real HTTP server/sockets.

// Every path prefix currently served by pages-server instead of PHP.
// /my-account: phase 5 step 2 (docs/php-to-js-migration/phase5-first-node-route.md).
// /login: phase 5 step 3 - Node must WRITE a session PHP will
// recognize here, not just read one PHP already wrote (see
// pages-server/php-serialize.mjs's doc comment for why that's harder
// than it sounds).
// /logout: phase 5 step 4 - the natural complement to /login, reusing
// the same session infrastructure to destroy a session instead of
// creating one.
// /my-account-delete: phase 5 step 5 - completes the /my-account
// family; deliberately diverges from PHP's own (buggy, non-
// transactional) delete logic - see pages-server/account-delete.mjs.
export const NODE_ROUTE_PATHS = ['/my-account', '/login', '/logout', '/my-account-delete'];

function matchesNodeRoute(path, pathname) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * True for a direct request to one of NODE_ROUTE_PATHS, or the "ugly
 * URL" (rewrite_urls off) form PHP's own Router.php understands:
 * /index.php?route=/my-account (see app/Http/Middleware/Router.php:54,69-73
 * - ?route= holds a path, not a route name).
 *
 * @param {string} pathname
 * @param {URLSearchParams} searchParams
 */
export function isNodeRoute(pathname, searchParams) {
  if (NODE_ROUTE_PATHS.some((path) => matchesNodeRoute(path, pathname))) {
    return true;
  }

  const route = searchParams.get('route');

  return route !== null && NODE_ROUTE_PATHS.some((path) => matchesNodeRoute(path, route));
}

/**
 * The ugly-URL form (?route=/my-account) is detected above, but
 * pages-server/index.mjs only ever matches on a plain /my-account
 * pathname - it doesn't (and shouldn't) know about PHP's own
 * query-string routing convention. So when forwarding to pages-server,
 * rewrite to the plain path, dropping `route` from the query string -
 * the same normalization app/Http/Middleware/Router.php:69-73 does for
 * PHP's own router when rewrite_urls is off.
 *
 * @param {URL} url
 */
export function rewriteForPages(url) {
  const route = url.searchParams.get('route');

  if (route === null) {
    return url.pathname + url.search;
  }

  const rewritten = new URL(route, 'http://localhost');

  for (const [key, value] of url.searchParams) {
    if (key !== 'route') {
      rewritten.searchParams.set(key, value);
    }
  }

  return rewritten.pathname + rewritten.search;
}
