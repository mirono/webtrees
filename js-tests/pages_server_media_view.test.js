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
import { renderMediaPage } from '../pages-server/media-view.mjs';

function baseFile(overrides = {}) {
  return {
    filename: 'yael-weiss.jpg',
    isExternal: false,
    mimeType: 'image/jpeg',
    fullMimeType: 'image/jpeg',
    format: 'jpeg',
    type: 'photo',
    title: 'Yael Weiss',
    imageUrl: 'https://example.com/thumb.jpg',
    downloadUrl: 'https://example.com/download?disposition=inline',
    attachmentUrl: 'https://example.com/download?disposition=attachment',
    showDownloadLink: false,
    ...overrides,
  };
}

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    media: {
      xref: 'M1',
      fullNameHtml: '<bdi>Yael Weiss</bdi>',
      files: [],
      facts: [],
    },
    ...overrides,
  };
}

describe('renderMediaPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    expect(renderMediaPage(baseParams())).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('the header shows the tree title, not its slug', () => {
    expect(renderMediaPage(baseParams())).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('renders the derived title as the page heading', () => {
    expect(renderMediaPage(baseParams())).toContain('<h2 class="wt-page-title"><bdi>Yael Weiss</bdi></h2>');
  });

  describe('a media file row', () => {
    test('shows Title/Media type/Format but NOT Filename for a non-external file (no editor mode)', () => {
      const html = renderMediaPage(baseParams({ media: { ...baseParams().media, files: [baseFile()] } }));

      expect(html).toContain('Media file');
      expect(html).toContain('<span class="label">Title</span>: <span class="value align-top">Yael Weiss</span>');
      expect(html).toContain('<span class="label">Media type</span>: <span class="value align-top">Photo</span>');
      expect(html).toContain('<span class="label">Format</span>: <span class="value align-top">jpeg</span>');
      expect(html).not.toContain('<span class="label">Filename</span>');
    });

    test('shows Filename for an external file', () => {
      const html = renderMediaPage(
        baseParams({
          media: { ...baseParams().media, files: [baseFile({ isExternal: true, filename: 'https://example.com/x.jpg' })] },
        }),
      );

      expect(html).toContain('<span class="label">Filename</span>: <span class="value align-top">https://example.com/x.jpg</span>');
    });

    test('an unrecognized media type falls back to the raw value, wrapped in <bdi>', () => {
      const html = renderMediaPage(baseParams({ media: { ...baseParams().media, files: [baseFile({ type: 'custom-type' })] } }));

      expect(html).toContain('<span class="value align-top"><bdi>custom-type</bdi></span>');
    });

    test('a displayable image renders an <img> linking to the download URL, inside a gallery link', () => {
      const html = renderMediaPage(baseParams({ media: { ...baseParams().media, files: [baseFile()] } }));

      expect(html).toContain('<a href="https://example.com/download?disposition=inline" data-wt-gallery="1">');
      expect(html).toContain('<img dir="auto" src="https://example.com/thumb.jpg" alt="">');
    });

    test('a non-image file (e.g. PDF) renders a mime-type icon instead of an <img>, still linking to download', () => {
      const html = renderMediaPage(
        baseParams({
          media: {
            ...baseParams().media,
            files: [baseFile({ mimeType: null, fullMimeType: 'application/pdf', imageUrl: null, type: 'document', format: 'pdf' })],
          },
        }),
      );

      expect(html).not.toContain('<img');
      expect(html).toContain('wt-mime wt-mime-application wt-mime-application-pdf');
    });

    test('the "Download file" link only appears when showDownloadLink is true', () => {
      const withoutLink = renderMediaPage(baseParams({ media: { ...baseParams().media, files: [baseFile({ showDownloadLink: false })] } }));
      const withLink = renderMediaPage(baseParams({ media: { ...baseParams().media, files: [baseFile({ showDownloadLink: true })] } }));

      expect(withoutLink).not.toContain('Download file');
      expect(withLink).toContain('<a href="https://example.com/download?disposition=attachment">Download file</a>');
    });

    test('escapes a title containing markup', () => {
      const html = renderMediaPage(
        baseParams({ media: { ...baseParams().media, files: [baseFile({ title: '<script>alert(1)</script>' })] } }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('the facts table', () => {
    test('is present (with just file rows) even with zero remaining facts', () => {
      expect(renderMediaPage(baseParams())).toContain('wt-facts-table');
    });

    test('renders CHAN with date and time in separate spans, and a bolded author line', () => {
      const html = renderMediaPage(
        baseParams({
          media: {
            ...baseParams().media,
            facts: [{ tag: 'CHAN', value: '', date: 'February 13, 2020', time: '19:43:52', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('<span class="date">February 13, 2020</span> – <span class="date">19:43:52</span>');
      expect(html).toContain('<span class="label">Author of last change</span>: <span class="value align-top">miron</span>');
    });

    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderMediaPage(
        baseParams({ media: { ...baseParams().media, facts: [{ tag: 'CHAN', value: '', date: '', time: '', author: '' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-CHAN');
      expect(html).not.toContain('descriptionbox');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderMediaPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderMediaPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
