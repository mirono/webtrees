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

// Mirrors LeafletJsService::config() (app/Services/LeafletJsService.php) -
// shared by every map-drawing chart (so far just PedigreeMapModule,
// phase 5 step 38). Only OpenStreetMap's own tile-layer config is
// ported: EsriMaps/GoogleMaps/HereMaps/MapBox are all confirmed
// `disabled` on this migration's own "ophir" tree (live DB check), so
// a real install with one of those enabled instead would need this
// list extended - same "only what's reachable" scope already applied
// elsewhere in this migration (e.g. statistics-chart's ISO-3166 table).

const OSM_REFERRER_POLICY = 'strict-origin-when-cross-origin';

function openStreetMapTileLayers() {
  return [
    {
      attribution: 'Map data ©<a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0">CC-BY-SA</a>',
      default: true,
      label: 'Mapnik',
      referrerPolicy: OSM_REFERRER_POLICY,
      maxZoom: 19,
      minZoom: 2,
      subdomains: ['a', 'b', 'c'],
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      localName: 'OpenStreetMapsMapnik',
    },
    {
      attribution: 'Map data ©<a href="https://www.openstreetmap.org">Karte hergestellt aus OpenStreetMap-Daten</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0">CC-BY-SA</a>',
      default: false,
      label: 'Deutsch',
      referrerPolicy: OSM_REFERRER_POLICY,
      maxZoom: 18,
      minZoom: 2,
      subdomains: ['a', 'b', 'c'],
      url: 'https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png',
      localName: 'OpenStreetMapsDeutsch',
    },
    {
      attribution: 'Map data ©<a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0">CC-BY-SA</a>',
      default: false,
      label: 'Français',
      referrerPolicy: OSM_REFERRER_POLICY,
      maxZoom: 20,
      minZoom: 2,
      subdomains: ['a', 'b', 'c'],
      url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
      localName: 'OpenStreetMapsFrench',
    },
  ];
}

// Icon markup mirrors resources/views/icons/{collapse,expand,undo,enter-fullscreen,exit-fullscreen}.phtml -
// every one a bare Font Awesome span, same convention as the inline
// icons already used in pedigree-map.mjs's own renderEventSummary().
const ICONS = {
  collapse: '<span class="wt-icon-collapse"><i class="fa-solid fa-caret-up"></i></span>',
  expand: '<span class="wt-icon-expand"><i class="fa-solid fa-caret-down"></i></span>',
  reset: '<span class="wt-icon-undo"><i class="fa-solid fa-undo"></i></span>',
  fullScreen:
    '<span title="Enter fullscreen"><span class="wt-icon-enter-fullscreen"><i class="fa-solid fa-expand"></i></span></span>' +
    '<span title="Exit fullscreen"><span class="wt-icon-exit-fullscreen"><i class="fa-solid fa-compress"></i></span></span>',
};

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<object|null>} null if no map-provider module is enabled (mirrors the real
 *   HttpServiceUnavailableException case - the caller 503s instead)
 */
export async function buildLeafletJsConfig(pool) {
  const result = await pool.query("SELECT status FROM wt_module WHERE module_name = 'openstreetmap'", []);
  const openStreetMapEnabled = result.rows[0]?.status === 'enabled';

  const mapProviders = [];

  if (openStreetMapEnabled) {
    mapProviders.push({
      children: openStreetMapTileLayers(),
      collapsed: true,
      default: true,
      label: 'OpenStreetMap™',
    });
  }

  if (mapProviders.length === 0) {
    return null;
  }

  return { icons: ICONS, mapProviders };
}
