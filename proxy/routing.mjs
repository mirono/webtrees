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

// /tree/{tree}/source/{xref}{/slug}: phase 5 step 13 - the third
// real-GEDCOM-record route, and the first that isn't Individual/Family
// (see docs/php-to-js-migration/phase5-source-page.md). Same reasoning
// as isIndividualPagePath() above.
export function isSourcePagePath(pathname) {
  return /^\/tree\/[^/]+\/source\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/repository/{xref}{/slug}: RepositoryPage, the fourth
// real-GEDCOM-record route (see docs/php-to-js-migration/
// phase5-repository-page.md). Same reasoning as isSourcePagePath() above.
export function isRepositoryPagePath(pathname) {
  return /^\/tree\/[^/]+\/repository\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/note/{xref}{/slug}: NotePage, the fifth real-GEDCOM-record
// route (see docs/php-to-js-migration/phase5-note-page.md). Same
// reasoning as isSourcePagePath() above. Deliberately NOT matching
// /tree/{tree}/shared-note/{xref} - see pages-server/routes.mjs's
// matchNotePagePath() doc comment.
export function isNotePagePath(pathname) {
  return /^\/tree\/[^/]+\/note\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/media/{xref}{/slug}: MediaPage, the sixth real-GEDCOM-record
// route (see docs/php-to-js-migration/phase5-media-page.md). Same
// reasoning as isSourcePagePath() above. The required trailing "/media/"
// (not just "/media") also correctly excludes the bare /tree/{tree}/media
// (ManageMediaPage) and /tree/{tree}/media-upload routes, both of which
// stay on PHP.
export function isMediaPagePath(pathname) {
  return /^\/tree\/[^/]+\/media\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/submitter/{xref}{/slug}: SubmitterPage, the seventh
// real-GEDCOM-record route (see docs/php-to-js-migration/
// phase5-submitter-page.md). Same reasoning as isSourcePagePath() above.
export function isSubmitterPagePath(pathname) {
  return /^\/tree\/[^/]+\/submitter\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/header/{xref}{/slug}: HeaderPage, the eighth real-GEDCOM-record
// route (see docs/php-to-js-migration/phase5-header-page.md). Same
// reasoning as isSourcePagePath() above.
export function isHeaderPagePath(pathname) {
  return /^\/tree\/[^/]+\/header\/[^/]+(?:\/.*)?$/.test(pathname);
}

// /tree/{tree}/repository-list: RepositoryListModule, the first "list"
// route this migration has ported (see docs/php-to-js-migration/
// phase5-repository-list.md). An EXACT match, not a prefix - same
// shape as isTreePagePath() above.
export function isRepositoryListPagePath(pathname) {
  return /^\/tree\/[^/]+\/repository-list\/?$/.test(pathname);
}

// /tree/{tree}/source-list: SourceListModule, the second "list" route
// this migration has ported (see docs/php-to-js-migration/
// phase5-source-list.md). Same exact-match shape as
// isRepositoryListPagePath() above.
export function isSourceListPagePath(pathname) {
  return /^\/tree\/[^/]+\/source-list\/?$/.test(pathname);
}

// /tree/{tree}/note-list: NoteListModule, the third "list" route this
// migration has ported (see docs/php-to-js-migration/
// phase5-note-list.md). Same exact-match shape as
// isRepositoryListPagePath()/isSourceListPagePath() above.
export function isNoteListPagePath(pathname) {
  return /^\/tree\/[^/]+\/note-list\/?$/.test(pathname);
}

// /tree/{tree}/location-list: LocationListModule, the fourth "list" route
// this migration has ported (see docs/php-to-js-migration/
// phase5-location-list.md). Same exact-match shape as
// isRepositoryListPagePath()/isSourceListPagePath()/isNoteListPagePath() above.
export function isLocationListPagePath(pathname) {
  return /^\/tree\/[^/]+\/location-list\/?$/.test(pathname);
}

// /tree/{tree}/family-list: FamilyListModule (AbstractIndividualListModule's
// routeUrl() override) - the first full-fidelity list route (real
// families-table.phtml/surnames-table.phtml markup, not the
// plain-table simplification every prior list route used). Same
// exact-match shape as the other list-page matchers above; query
// params (surname/alpha/falpha/show/etc.) are never part of `pathname`
// (URL parsing strips them before this runs), so no extra handling is
// needed here.
export function isFamilyListPagePath(pathname) {
  return /^\/tree\/[^/]+\/family-list\/?$/.test(pathname);
}

// /tree/{tree}/individual-list: IndividualListModule (the OTHER
// AbstractIndividualListModule subclass) - same exact-match shape as
// isFamilyListPagePath() above.
export function isIndividualListPagePath(pathname) {
  return /^\/tree\/[^/]+\/individual-list\/?$/.test(pathname);
}

// /tree/{tree}/media-list: MediaListModule - same exact-match shape as
// the other list-page matchers above.
export function isMediaListPagePath(pathname) {
  return /^\/tree\/[^/]+\/media-list\/?$/.test(pathname);
}

// /tree/{tree}/ancestors-{style}-{generations}/{xref}: AncestorsChartModule,
// the FIRST chart route (phase 5 step 27) - style is tree|individuals|families,
// generations is an integer, both path tokens (not query params).
export function isAncestorsChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/ancestors-(tree|individuals|families)-\d+\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/descendants-{style}-{generations}/{xref}: DescendancyChartModule
// (phase 5 step 28) - same shape as isAncestorsChartPagePath() above.
export function isDescendancyChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/descendants-(tree|individuals|families)-\d+\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/hourglass-{generations}-{spouses}/{xref}: HourglassChartModule
// - no "style" token, a boolean "0"/"1" token in its place.
export function isHourglassChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/hourglass-\d+-[01]\/[^/]+\/?$/.test(pathname);
}

// /module/hourglass_chart/{Ancestors|Descendants}/{tree}: the lazy-load
// "expand one more generation" arrow endpoints behind HourglassChartModule's
// own getAncestorsAction()/getDescendantsAction() - the first (deliberately
// narrow) use of PHP's generic `/module/{module}/{action}/{tree}` route
// shape in this migration. See pages-server/routes.mjs's
// matchHourglassChartActionPath() doc comment for why it's scoped to just
// this one module's two actions.
export function isHourglassChartActionPath(pathname) {
  return /^\/module\/hourglass_chart\/(Ancestors|Descendants)\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/family-book-{book_size}-{generations}-{spouses}/{xref}:
// FamilyBookChartModule - two numeric generation tokens (book_size,
// generations), the same boolean "0"/"1" spouses token as Hourglass, no
// module-action route (this module has no lazy-load arrows at all).
export function isFamilyBookChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/family-book-\d+-\d+-[01]\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/compact/{xref}: CompactTreeChartModule - the FIFTH
// chart route, the simplest (no generations/style/spouses tokens at
// all - always exactly 5 fixed generations).
export function isCompactTreeChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/compact\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/fan-chart-{style}-{generations}-{width}/{xref}:
// FanChartModule - the SIXTH chart route. Real PHP renders a GD PNG
// bitmap; the Node port renders the same wedge geometry as inline SVG
// instead, so no module-action route is needed here either.
export function isFanChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/fan-chart-\d+-\d+-\d+\/[^/]+\/?$/.test(pathname);
}

// /tree/{tree}/lifespans: LifespansChartModule - the SEVENTH chart
// route, with no {xref} path segment (the accumulated individual list
// lives in the `xrefs` query string).
export function isLifespansChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/lifespans\/?$/.test(pathname);
}

// /tree/{tree}/timeline-{scale}: TimelineChartModule - the EIGHTH
// chart route.
export function isTimelineChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/timeline-\d+\/?$/.test(pathname);
}

// /tree/{tree}/relationships-{ancestors}-{recursion}/{xref}{/xref2}:
// RelationshipsChartModule - the NINTH chart route.
export function isRelationshipsChartPagePath(pathname) {
  return /^\/tree\/[^/]+\/relationships-\d+-\d+\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname);
}

// /module/statistics_chart/{Chart|Individuals|Families|Other|Custom|CustomChart}/{tree}:
// StatisticsChartModule - the TENTH chart route, and the SECOND
// (deliberately narrow) use of PHP's generic `/module/{module}/{action}/{tree}`
// route shape - see isHourglassChartActionPath() above for the first.
// This module has no `{xref}` of its own (a tree-wide chart, not an
// individual's), so unlike every other chart route this one has no
// trailing xref segment at all.
export function isStatisticsChartActionPath(pathname) {
  return /^\/module\/statistics_chart\/(Chart|Individuals|Families|Other|Custom|CustomChart)\/[^/]+\/?$/.test(pathname);
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
    isFamilyPagePath(pathname) ||
    isSourcePagePath(pathname) ||
    isRepositoryPagePath(pathname) ||
    isNotePagePath(pathname) ||
    isMediaPagePath(pathname) ||
    isSubmitterPagePath(pathname) ||
    isHeaderPagePath(pathname) ||
    isRepositoryListPagePath(pathname) ||
    isSourceListPagePath(pathname) ||
    isNoteListPagePath(pathname) ||
    isLocationListPagePath(pathname) ||
    isFamilyListPagePath(pathname) ||
    isIndividualListPagePath(pathname) ||
    isMediaListPagePath(pathname) ||
    isAncestorsChartPagePath(pathname) ||
    isDescendancyChartPagePath(pathname) ||
    isHourglassChartPagePath(pathname) ||
    isHourglassChartActionPath(pathname) ||
    isFamilyBookChartPagePath(pathname) ||
    isCompactTreeChartPagePath(pathname) ||
    isFanChartPagePath(pathname) ||
    isLifespansChartPagePath(pathname) ||
    isTimelineChartPagePath(pathname) ||
    isRelationshipsChartPagePath(pathname) ||
    isStatisticsChartActionPath(pathname)
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
    isFamilyPagePath(route) ||
    isSourcePagePath(route) ||
    isRepositoryPagePath(route) ||
    isNotePagePath(route) ||
    isMediaPagePath(route) ||
    isSubmitterPagePath(route) ||
    isHeaderPagePath(route) ||
    isRepositoryListPagePath(route) ||
    isSourceListPagePath(route) ||
    isNoteListPagePath(route) ||
    isLocationListPagePath(route) ||
    isFamilyListPagePath(route) ||
    isIndividualListPagePath(route) ||
    isMediaListPagePath(route) ||
    isAncestorsChartPagePath(route) ||
    isDescendancyChartPagePath(route) ||
    isHourglassChartPagePath(route) ||
    isHourglassChartActionPath(route) ||
    isFamilyBookChartPagePath(route) ||
    isCompactTreeChartPagePath(route) ||
    isFanChartPagePath(route) ||
    isLifespansChartPagePath(route) ||
    isTimelineChartPagePath(route) ||
    isRelationshipsChartPagePath(route) ||
    isStatisticsChartActionPath(route)
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
