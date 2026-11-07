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

import { describe, expect, test } from 'vitest';
import { renderPedigreeMapChart, renderPedigreeMapPage } from '../pages-server/pedigree-map-view.mjs';

describe('renderPedigreeMapChart', () => {
  test('embeds the GeoJSON data and leaflet config as JSON', () => {
    const data = { type: 'FeatureCollection', features: [] };
    const leafletConfig = { icons: {}, mapProviders: [] };

    const html = renderPedigreeMapChart({ data, leafletConfig });

    expect(html).toContain('id="wt-map"');
    expect(html).toContain('wt-map-sidebar');
    expect(html).toContain(JSON.stringify(data));
    expect(html).toContain(JSON.stringify(leafletConfig));
    expect(html).toContain('webtrees.buildLeafletJsMap');
  });
});

describe('renderPedigreeMapPage', () => {
  const baseParams = {
    tree: { title: 'Ophir', name: 'ophir' },
    user: null,
    csrfToken: null,
    title: 'Pedigree map of John Doe',
    individual: { xref: 'I1' },
    generations: 4,
    minGenerations: 1,
    maxGenerations: 63,
    mapHtml: '<div id="wt-map"></div>',
  };

  test('renders the options form with the current xref/generations', () => {
    const html = renderPedigreeMapPage(baseParams);

    expect(html).toContain('<h2 class="wt-page-title">Pedigree map of John Doe</h2>');
    expect(html).toContain('value="I1"');
    expect(html).toContain('value="4"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="63"');
    expect(html).toContain('<div id="wt-map"></div>');
  });

  test('escapes HTML-unsafe xref values', () => {
    const html = renderPedigreeMapPage({ ...baseParams, individual: { xref: '<script>' } });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('shows a sign-in link when there is no logged-in user, and omits the csrf meta tag', () => {
    const html = renderPedigreeMapPage(baseParams);

    expect(html).toContain('href="/login"');
    expect(html).not.toContain('name="csrf"');
  });

  test('shows the user menu and csrf meta tag when logged in', () => {
    const html = renderPedigreeMapPage({ ...baseParams, user: { realName: 'Jane' }, csrfToken: 'tok123' });

    expect(html).toContain('Jane');
    expect(html).toContain('name="csrf" content="tok123"');
    expect(html).toContain('name="csrf" value="tok123"');
  });

  test('includes the genealogy menu bar when supplied', () => {
    const html = renderPedigreeMapPage({ ...baseParams, genealogyMenuHtml: '<nav class="wt-genealogy-menu"></nav>' });

    expect(html).toContain('<nav class="wt-genealogy-menu"></nav>');
  });
});
