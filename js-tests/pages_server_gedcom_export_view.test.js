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
import { renderExportGedcomPage } from '../pages-server/gedcom-export-view.mjs';

describe('renderExportGedcomPage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      filename: 'ophir.ged',
      downloadFilenames: {
        ophir: 'ophir',
        'ophir-2026-01-15': 'ophir-2026-01-15',
      },
      isAdmin: false,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title in the page title', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token value in hidden input', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('value="test-csrf-token"');
  });

  test('includes the server export form action with tree name', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('/tree/ophir/export-server');
  });

  test('includes the client export form action with tree name', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('/tree/ophir/export-client');
  });

  test('includes the breadcrumb with tree name', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes both download filename options', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('value="ophir"');
    expect(html).toContain('value="ophir-2026-01-15"');
  });

  test('HTML-escapes the tree title', () => {
    const html = renderExportGedcomPage(baseParams({
      tree: { gedcom_name: 'test', title: '<script>alert("xss")</script>' },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('HTML-escapes the filename', () => {
    const html = renderExportGedcomPage(baseParams({
      filename: 'test"<>&.ged',
    }));
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&amp;');
  });

  test('HTML-escapes download filename options', () => {
    const html = renderExportGedcomPage(baseParams({
      downloadFilenames: {
        'test<script>': 'test<script>',
      },
    }));
    expect(html).toContain('&lt;script&gt;');
  });

  describe('privacy radio options when isAdmin: false', () => {
    test('does NOT include the "none" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: false }));
      expect(html).not.toContain('value="none"');
    });

    test('includes "gedadmin" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: false }));
      expect(html).toContain('value="gedadmin"');
    });

    test('includes "user" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: false }));
      expect(html).toContain('value="user"');
    });

    test('includes "visitor" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: false }));
      expect(html).toContain('value="visitor"');
    });

    test('gedadmin is the default selection', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: false }));
      const match = html.match(/value="gedadmin"[^>]*\s*(checked)?/);
      expect(match && match[0].includes('checked')).toBe(true);
    });
  });

  describe('privacy radio options when isAdmin: true', () => {
    test('includes the "none" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: true }));
      expect(html).toContain('value="none"');
    });

    test('includes "gedadmin" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: true }));
      expect(html).toContain('value="gedadmin"');
    });

    test('includes "user" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: true }));
      expect(html).toContain('value="user"');
    });

    test('includes "visitor" option', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: true }));
      expect(html).toContain('value="visitor"');
    });

    test('none is the default selection for admins', () => {
      const html = renderExportGedcomPage(baseParams({ isAdmin: true }));
      const match = html.match(/value="none"[^>]*\s*(checked)?/);
      expect(match && match[0].includes('checked')).toBe(true);
    });
  });

  test('includes encoding options', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('value="UTF-8"');
    expect(html).toContain('UNICODE (UTF16-BE)');
    expect(html).toContain('ANSEL');
    expect(html).toContain('ASCII');
    expect(html).toContain('ANSI (CP1252)');
  });

  test('UTF-8 is the default encoding', () => {
    const html = renderExportGedcomPage(baseParams());
    const match = html.match(/value="UTF-8"[^>]*\s*(selected)?/);
    expect(match && match[0].includes('selected')).toBe(true);
  });

  test('includes line endings radio buttons', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('value="CRLF"');
    expect(html).toContain('value="LF"');
  });

  test('CRLF is the default line ending', () => {
    const html = renderExportGedcomPage(baseParams());
    const match = html.match(/value="CRLF"[^>]*\s*(checked)?/);
    expect(match && match[0].includes('checked')).toBe(true);
  });

  test('includes format radio buttons', () => {
    const html = renderExportGedcomPage(baseParams());
    expect(html).toContain('value="gedcom"');
    expect(html).toContain('value="zip"');
    expect(html).toContain('value="zipmedia"');
    expect(html).toContain('value="gedzip"');
  });

  test('gedcom format is the default', () => {
    const html = renderExportGedcomPage(baseParams());
    const match = html.match(/id="format-gedcom"[^>]*\s*(checked)?/);
    expect(match && match[0].includes('checked')).toBe(true);
  });

  test('HTML-escapes tree name in both form actions', () => {
    const html = renderExportGedcomPage(baseParams({
      tree: { gedcom_name: 'test"tree', title: 'Test' },
    }));
    expect(html).toContain('/tree/test%22tree/export-server');
  });
});
