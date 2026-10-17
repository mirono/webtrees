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
import { renderMediaListPage } from '../pages-server/media-list-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree', name: 'ophir' },
    user: null,
    csrfToken: null,
    folders: [''],
    folder: '',
    subdirs: false,
    max: 20,
    format: '',
    filter: '',
    count: 0,
    page: 1,
    pages: 1,
    media: [],
    ...overrides,
  };
}

function baseMedia(overrides = {}) {
  return {
    xref: 'M1',
    url: '/tree/ophir/media/M1',
    fullNameHtml: '<span>Photo title</span>',
    thumbnailHtml: ['<img src="/tree/ophir/media-thumbnail?s=abc">'],
    typeLabelHtml: '',
    sourceFactsHtml: '',
    noteFactsHtml: '',
    filenameHtml: '',
    linkedIndividuals: [],
    linkedFamilies: [],
    linkedSources: [],
    linkedLocations: [],
    ...overrides,
  };
}

describe('renderMediaListPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderMediaListPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('shows the tree title, not its slug', () => {
    expect(renderMediaListPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('shows the "Media objects found" count', () => {
    expect(renderMediaListPage(baseParams({ count: 42 }))).toContain('Media objects found 42');
  });

  test('no pagination block when there are no media (the initial, unsearched state)', () => {
    const html = renderMediaListPage(baseParams({ media: [] }));
    expect(html).not.toContain('Page 1 of');
  });

  test('pagination appears both above and below the card grid when there are results', () => {
    const html = renderMediaListPage(baseParams({ media: [baseMedia()], count: 1, pages: 3, page: 2 }));
    const occurrences = html.split('Page 2 of 3').length - 1;
    expect(occurrences).toBe(2);
  });

  test('"first"/"previous" links are omitted on page 1, present otherwise', () => {
    const onPage1 = renderMediaListPage(baseParams({ media: [baseMedia()], pages: 3, page: 1 }));
    const onPage2 = renderMediaListPage(baseParams({ media: [baseMedia()], pages: 3, page: 2 }));

    expect(onPage1).not.toContain('>first<');
    expect(onPage1).not.toContain('>previous<');
    expect(onPage2).toContain('>first<');
    expect(onPage2).toContain('>previous<');
  });

  test('"next"/"last" links are omitted on the final page, present otherwise', () => {
    const onLastPage = renderMediaListPage(baseParams({ media: [baseMedia()], pages: 3, page: 3 }));
    const onMiddlePage = renderMediaListPage(baseParams({ media: [baseMedia()], pages: 3, page: 2 }));

    expect(onLastPage).not.toContain('>next<');
    expect(onLastPage).not.toContain('>last<');
    expect(onMiddlePage).toContain('>next<');
    expect(onMiddlePage).toContain('>last<');
  });

  test('folder options render with the current selection marked', () => {
    const html = renderMediaListPage(baseParams({ folders: ['', 'photos', 'documents'], folder: 'photos' }));
    expect(html).toContain('<option value="photos" selected="selected">photos</option>');
  });

  test('a media card shows its title, thumbnail, and linked-record footer with the right icon classes', () => {
    const media = baseMedia({
      linkedIndividuals: [{ url: '/tree/ophir/individual/I1', fullNameHtml: '<span>John Smith</span>' }],
      linkedFamilies: [{ url: '/tree/ophir/family/F1', fullNameHtml: '<span>Smith family</span>' }],
      linkedSources: [{ url: '/tree/ophir/source/S1', fullNameHtml: '<span>Census</span>' }],
      linkedLocations: [{ url: '/tree/ophir/location/L1', fullNameHtml: '<span>London</span>' }],
    });
    const html = renderMediaListPage(baseParams({ media: [media], count: 1 }));

    expect(html).toContain('Photo title');
    expect(html).toContain('<img src="/tree/ophir/media-thumbnail?s=abc">');
    expect(html).toContain('wt-icon-individual');
    expect(html).toContain('John Smith');
    expect(html).toContain('wt-icon-family');
    expect(html).toContain('Smith family');
    expect(html).toContain('wt-icon-source');
    expect(html).toContain('Census');
    expect(html).toContain('wt-icon-location');
    expect(html).toContain('London');
  });

  test('multiple media objects each render their own card', () => {
    const html = renderMediaListPage(
      baseParams({ media: [baseMedia({ xref: 'M1', fullNameHtml: '<span>First</span>' }), baseMedia({ xref: 'M2', fullNameHtml: '<span>Second</span>' })], count: 2 }),
    );
    expect(html).toContain('First');
    expect(html).toContain('Second');
  });

  test('the reset link points at the bare media-list URL with no query string', () => {
    const html = renderMediaListPage(baseParams({ folder: 'photos', filter: 'smith' }));
    expect(html).toContain('href="/tree/ophir/media-list"');
  });

  test('escapes a filter value containing HTML-significant characters', () => {
    const html = renderMediaListPage(baseParams({ filter: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
