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

// Mirrors app/Factories/RouteFactory.php::route()'s URL-generation.
// `extraParams` covers routes that take query-string parameters
// alongside (or instead of) path placeholders - e.g. MediaFileThumbnail
// registers at the bare path `/media-thumbnail` with every real
// parameter (xref/tree/fact_id/w/h/fit/mark/s) passed as a query
// param. Confirmed via app/Http/Middleware/Router.php:54-70: the
// ugly-URL branch does `$uri = $request->getUri()->withPath($url_route)`
// - this replaces ONLY the path, so any OTHER query params on the
// original request (the ones this function must therefore also emit)
// survive as sibling top-level params next to `route=`, not nested
// inside it.
//
// Confirmed live (2026-09-20): with rewrite_urls off (this dev
// config), PHP's router only accepts the ugly-URL ?route= form for a
// route it owns - a plain clean path 404s, even for a bare "/".

/**
 * @param {string} path e.g. "/tree/ophir/my-page"
 * @param {{baseUrl: string, rewriteUrls: boolean}} siteUrlConfig
 * @param {Record<string, string>} extraParams query-string parameters
 *   beyond the path itself - e.g. MediaFileThumbnail's xref/tree/etc.
 * @returns {string}
 */
export function phpRouteUrl(path, { baseUrl, rewriteUrls }, extraParams = {}) {
  if (rewriteUrls) {
    const query = new URLSearchParams(extraParams).toString();

    return query === '' ? baseUrl + path : `${baseUrl}${path}?${query}`;
  }

  const query = new URLSearchParams({ route: path, ...extraParams }).toString();

  return `${baseUrl}/index.php?${query}`;
}
