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
// /: phase 5 step 6 - the home page, almost entirely a redirect
// dispatcher (see docs/php-to-js-migration/phase5-home-page.md).
// /language, /theme: phase 5 step 7 - CSRF-exempt (same exclusion list
// as /logout), no-login-required session+DB preference writes.
export const NODE_ROUTE_PATHS = ['/my-account', '/login', '/logout', '/my-account-delete', '/', '/language', '/theme'];

function matchesNodeRoute(path, pathname) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

// /tree/{tree}: phase 5 step 8 - the first tree-scoped route (see
// docs/php-to-js-migration/phase5-tree-page.md). PHP registers this at
// '' inside `/tree/{tree}`'s own attach block - an EXACT match, unlike
// every NODE_ROUTE_PATHS entry above (all of which are correctly
// prefix-matched via matchesNodeRoute(), since their PHP routes really
// are prefixes, e.g. /my-account{/tree}). Sibling routes under the
// same /tree/{tree} group (/tree/{tree}/individual/{xref},
// /tree/{tree}/my-page, ...) are NOT Node routes and must not match
// this pattern - a naive prefix match here would wrongly forward all
// of them too.
export function isTreePagePath(pathname) {
  return /^\/tree\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/individual/{xref}{/slug}: phase 5 step 9 - the first
// route serving real GEDCOM record data (see
// docs/php-to-js-migration/phase5-individual-page.md). Same
// exact-shape reasoning as isTreePagePath() above: a naive prefix
// match on '/tree/{tree}/individual/' would be fine here (unlike
// isTreePagePath(), this route doesn't have exact-match siblings
// registered AT its own path), but OTHER record types under the same
// '/tree/{tree}' group (/family/{xref}, /media/{xref}, ...) must NOT
// match this pattern - hence its own dedicated regex rather than
// folding into NODE_ROUTE_PATHS's prefix-match convention.
export function isIndividualPagePath(pathname) {
  return /^\/tree\/[^/]+\/individual\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/family/{xref}{/slug}: phase 5 step 10 - the second
// real-GEDCOM-record route (see docs/php-to-js-migration/phase5-family-page.md).
// Same reasoning as isIndividualPagePath() above.
export function isFamilyPagePath(pathname) {
  return /^\/tree\/[^/]+\/family\/[^/]+(?:\/.*)?$/.test(pathname);
}

/**
 * True for a direct request to one of NODE_ROUTE_PATHS or the
 * exact-match /tree/{tree} route, or the "ugly URL" (rewrite_urls off)
 * form PHP's own Router.php understands: /index.php?route=/my-account
 * (see app/Http/Middleware/Router.php:54,69-73 - ?route= holds a path,
 * not a route name).
 *
 * @param {string} pathname
 * @param {URLSearchParams} searchParams
 */
export function isNodeRoute(pathname, searchParams) {
  if (
    NODE_ROUTE_PATHS.some((path) => matchesNodeRoute(path, pathname)) ||
    isTreePagePath(pathname) ||
    isIndividualPagePath(pathname) ||
    isFamilyPagePath(pathname)
  ) {
    return true;
  }

  const route = searchParams.get('route');

  if (route === null) {
    return false;
  }

  return (
    NODE_ROUTE_PATHS.some((path) => matchesNodeRoute(path, route)) ||
    isTreePagePath(route) ||
    isIndividualPagePath(route) ||
    isFamilyPagePath(route)
  );
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
