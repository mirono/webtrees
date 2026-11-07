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

// HTML assembly for /tree/{tree}/pedigree-map-{generations}/{xref} -
// mirrors resources/views/modules/pedigree-map/{page,chart}.phtml
// EXACTLY. Unlike every other already-ported chart, PedigreeMap has
// NO ajax-loaded fragment at all - the GeoJSON data is embedded
// directly in the page's own <script> tag (real PHP's own
// `getMapData()` call happens inline inside `handle()`, not behind a
// separate `?ajax=1` action), so there is only one render function.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors resources/views/modules/pedigree-map/chart.phtml - the map
 * widget + its embedded data/config and the (already-shipped,
 * unmodified) client-side drawing script.
 *
 * @param {{data: object, leafletConfig: object}} params
 * @returns {string}
 */
export function renderPedigreeMapChart({ data, leafletConfig }) {
  return `<div class="row my-4 gchart wt-pedigree-map-wrapper wt-fullscreen-container">
    <div id="wt-map" class="col-sm-9 wt-map" dir="ltr"></div>
    <ul class="col-sm-3 wt-map-sidebar wt-page-options-value list-unstyled px-1 mb-0"></ul>
</div>

<script>
  'use strict';

  (function () {
    const config = ${JSON.stringify(leafletConfig)};
    const sidebar = document.querySelector('.wt-map-sidebar');

    const scrollOptions = {
      behavior: "smooth",
      block: "nearest",
      inline: "start"
    };

    let map = null;

    let markers = L.markerClusterGroup({
      showCoverageOnHover: false,
    });

    let resetCallback = function (event) {
       event.preventDefault();
      map.flyToBounds(markers.getBounds(), {padding: [50, 30], maxZoom: 15 });
    }

    let _drawMap = function () {
      map = webtrees.buildLeafletJsMap('wt-map', config, resetCallback);
    };

    let _buildMapData = function () {
      let geoJson_data = ${JSON.stringify(data)};

      if (geoJson_data.features.length === 0) {
        map.fitWorld();
        sidebar.innerHTML = '<div class="bg-info text-white text-center">' + ${JSON.stringify('Nothing to show')} + '</div>';
      } else {
        sidebar.innerHTML = '';
        let geoJsonLayer = L.geoJson(geoJson_data, {
          pointToLayer: function (feature, latlng) {
            return new L.Marker(latlng, {
              icon: L.BeautifyIcon.icon({
                icon: 'bullseye fas',
                borderColor: 'transparent',
                backgroundColor: feature.properties.iconcolor,
                iconShape: 'marker',
                textColor: 'white',
              }),
              title: feature.properties.tooltip,
              id: feature.id,
            })
              .on('popupopen', function (e) {
                let item = document.querySelector('[data-wt-feature-id="' + e.target.feature.id + '"]');
                item.classList.add('messagebox');
                item.scrollIntoView(scrollOptions);
              })
              .on('popupclose', function () {
                sidebar.childNodes.forEach(e => e.classList.remove('messagebox'));
              });
          },
          onEachFeature: function (feature, layer) {
            if (feature.properties.polyline) {
              let pline = L.polyline(feature.properties.polyline.points, feature.properties.polyline.options);
              markers.addLayer(pline);
            }

            layer.bindPopup(feature.properties.summary);
            sidebar.innerHTML += \`<li class="gchart p-1 mb-1" data-wt-feature-id=\${feature.id}>\${feature.properties.summary}</li>\`;
          },
        });
        markers.addLayer(geoJsonLayer);
        map.addLayer(markers);
        map.fitBounds(markers.getBounds(), { padding: [50, 30], maxZoom: 15 });
      }
    };

    window.addEventListener('load', function () {
      sidebar.addEventListener('click', (e) => {
        if (e.target.matches('[data-wt-sosa]')) {
          e.preventDefault();
          map.closePopup();

          let marker = markers.getLayers().filter(function (v) {
            return v.feature !== undefined && v.feature.id === parseInt(e.target.dataset.wtSosa);
          }).pop();

          markers.zoomToShowLayer(marker, () => marker.openPopup());

          return false;
        }
      });
    });

    _drawMap();
    _buildMapData();
  })();
</script>`;
}

/**
 * Full page: /tree/{tree}/pedigree-map-{generations}/{xref}. Mirrors
 * resources/views/modules/pedigree-map/page.phtml - the options form
 * (individual + generations) plus the map itself, inline (no
 * ajax-loaded content div - see this file's own top doc comment).
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {{xref: string}} params.individual
 * @param {number} params.generations
 * @param {number} params.minGenerations
 * @param {number} params.maxGenerations
 * @param {string} params.mapHtml pre-rendered renderPedigreeMapChart() output
 * @param {string} [params.genealogyMenuHtml]
 * @returns {string}
 */
export function renderPedigreeMapPage({ tree, user, csrfToken, title, individual, generations, minGenerations, maxGenerations, mapHtml, genealogyMenuHtml = '' }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">`
      : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item">
                        <span class="nav-link">${escapeHtml(user.realName)}</span>
                    </li>
                    <li class="nav-item menu-logout">
                        <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                    </li>`
      : `
                    <li class="nav-item">
                        <a class="nav-link" href="/login">Sign in</a>
                    </li>`;

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-pedigree-map-chart-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">${escapeHtml(title)}</h2>

                    <form method="post" class="wt-page-options wt-page-options-pedigreemap-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="xref">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="xref" id="xref" value="${escapeHtml(individual.xref)}" required>
                            </div>
                        </div>

                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="generations">Generations</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" id="generations" name="generations" type="number" min="${minGenerations}" max="${maxGenerations}" value="${generations}" required="required">
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="btn btn-primary" type="submit" value="view">
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content">
                        ${mapHtml}
                    </div>
                </div>
            </div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
