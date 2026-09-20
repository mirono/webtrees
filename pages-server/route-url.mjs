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

// Mirrors app/Factories/RouteFactory.php::route()'s URL-generation for
// the one shape the home-page route needs: a plain path with no extra
// query parameters (every redirect target HomePage.php can produce -
// UserPage, TreePage, ManageTrees, CreateTreePage - takes only a
// {tree} path segment, never a query param). Not a general
// implementation of RouteFactory's full parameter/query-string
// handling - this project doesn't need one yet.
//
// Confirmed live (2026-09-20): with rewrite_urls off (this dev
// config), PHP's router only accepts the ugly-URL ?route= form for a
// route it owns - a plain clean path 404s, even for a bare "/".

/**
 * @param {string} path e.g. "/tree/ophir/my-page"
 * @param {{baseUrl: string, rewriteUrls: boolean}} siteUrlConfig
 * @returns {string}
 */
export function phpRouteUrl(path, { baseUrl, rewriteUrls }) {
  if (rewriteUrls) {
    return baseUrl + path;
  }

  const query = new URLSearchParams({ route: path }).toString();

  return `${baseUrl}/index.php?${query}`;
}
