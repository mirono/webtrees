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
import { renderImportGedcomPage, renderImportResultPage } from '../pages-server/gedcom-import-view.mjs';

describe('renderImportGedcomPage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      dataFolder: '/data/gedcom/',
      defaultGedcomFile: 'default.ged',
      serverFiles: ['file1.ged', 'file2.ged'],
      gedcomMediaPath: 'media/',
      keepMedia: false,
      wordWrappedNotes: false,
      hasExistingData: false,
      error: null,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderImportGedcomPage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title in the page', () => {
    const html = renderImportGedcomPage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token', () => {
    const html = renderImportGedcomPage(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  test('includes the form action pointing to /tree/{tree}/import', () => {
    const html = renderImportGedcomPage(baseParams());
    expect(html).toContain('/tree/ophir/import');
  });

  test('renders server files as option elements', () => {
    const html = renderImportGedcomPage(baseParams({
      serverFiles: ['a.ged', 'b.ged'],
    }));
    expect(html).toContain('value="a.ged"');
    expect(html).toContain('value="b.ged"');
    expect(html).toContain('option');
  });

  test('renders "No GEDCOM files found" message when serverFiles is empty', () => {
    const html = renderImportGedcomPage(baseParams({
      serverFiles: [],
    }));
    expect(html).toContain('No GEDCOM files found');
  });

  test('marks the defaultGedcomFile as selected', () => {
    const html = renderImportGedcomPage(baseParams({
      defaultGedcomFile: 'file1.ged',
      serverFiles: ['file1.ged', 'file2.ged'],
    }));
    const match = html.match(/value="file1\.ged"[^>]*selected/);
    expect(match).not.toBeNull();
  });

  test('includes data folder path in the form', () => {
    const html = renderImportGedcomPage(baseParams({
      dataFolder: '/custom/data/path/',
    }));
    expect(html).toContain('/custom/data/path/');
  });

  test('HTML-escapes the tree title', () => {
    const html = renderImportGedcomPage(baseParams({
      tree: { gedcom_name: 'test', title: '<script>alert("xss")</script>' },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('HTML-escapes the data folder path', () => {
    const html = renderImportGedcomPage(baseParams({
      dataFolder: '/path/with/"quotes"&ampersand/',
    }));
    expect(html).toContain('&quot;');
    expect(html).toContain('&amp;');
  });

  test('HTML-escapes gedcomMediaPath', () => {
    const html = renderImportGedcomPage(baseParams({
      gedcomMediaPath: 'path/with/"<>&/',
    }));
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&amp;');
  });

  test('HTML-escapes server file names', () => {
    const html = renderImportGedcomPage(baseParams({
      serverFiles: ['file<script>.ged', 'file&.ged'],
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  test('renders error alert when error is provided', () => {
    const html = renderImportGedcomPage(baseParams({
      error: 'Something went wrong',
    }));
    expect(html).toContain('alert alert-danger');
    expect(html).toContain('Something went wrong');
  });

  test('does not render error alert when error is null', () => {
    const html = renderImportGedcomPage(baseParams({
      error: null,
    }));
    expect(html).not.toContain('alert alert-danger');
  });

  test('HTML-escapes error message', () => {
    const html = renderImportGedcomPage(baseParams({
      error: 'Error: <script>bad</script>&"',
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>bad</script>');
  });

  describe('when hasExistingData is false', () => {
    test('submit button is not disabled', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: false,
      }));
      const submitBtn = html.match(/id="import-submit"[^>]*>/);
      expect(submitBtn).not.toBeNull();
      expect(html.match(/id="import-submit"[^>]*disabled/)).toBeNull();
    });

    test('does not render confirmation checkbox', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: false,
      }));
      expect(html).not.toContain('confirm-replace');
      expect(html).not.toContain('confirm');
    });

    test('does not render destructive-replace warning', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: false,
      }));
      expect(html).not.toContain('delete all');
    });
  });

  describe('when hasExistingData is true', () => {
    test('submit button is disabled', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: true,
      }));
      expect(html.match(/id="import-submit"[^>]*disabled/)).not.toBeNull();
    });

    test('renders confirmation checkbox', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: true,
      }));
      expect(html).toContain('confirm-replace');
      expect(html).toContain('checkbox');
    });

    test('renders destructive-replace warning', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: true,
      }));
      expect(html).toContain('already contains genealogy data');
      expect(html).toContain('permanently delete');
    });

    test('warning mentions keeping media if checked', () => {
      const html = renderImportGedcomPage(baseParams({
        hasExistingData: true,
      }));
      expect(html).toContain('Keep media objects');
    });
  });

  describe('preference checkboxes', () => {
    test('keepMedia checkbox is checked when keepMedia is true', () => {
      const html = renderImportGedcomPage(baseParams({
        keepMedia: true,
      }));
      expect(html).toContain('id="keep_media"');
      const match = html.match(/id="keep_media"[^>]*checked/);
      expect(match).not.toBeNull();
    });

    test('keepMedia checkbox is not checked when keepMedia is false', () => {
      const html = renderImportGedcomPage(baseParams({
        keepMedia: false,
      }));
      expect(html).toContain('id="keep_media"');
      const match = html.match(/id="keep_media"[^>]*checked/);
      expect(match).toBeNull();
    });

    test('wordWrappedNotes checkbox is checked when true', () => {
      const html = renderImportGedcomPage(baseParams({
        wordWrappedNotes: true,
      }));
      const match = html.match(/id="WORD_WRAPPED_NOTES"[^>]*checked/);
      expect(match).not.toBeNull();
    });

    test('wordWrappedNotes checkbox is not checked when false', () => {
      const html = renderImportGedcomPage(baseParams({
        wordWrappedNotes: false,
      }));
      const match = html.match(/id="WORD_WRAPPED_NOTES"[^>]*checked/);
      expect(match).toBeNull();
    });
  });

  test('gedcomMediaPath input has correct value', () => {
    const html = renderImportGedcomPage(baseParams({
      gedcomMediaPath: 'custom/media/path/',
    }));
    expect(html).toContain('id="GEDCOM_MEDIA_PATH"');
    expect(html).toContain('value="custom/media/path/"');
  });

  test('includes encoding select options', () => {
    const html = renderImportGedcomPage(baseParams());
    expect(html).toContain('name="encoding"');
    expect(html).toContain('UTF-8');
    expect(html).toContain('ANSEL');
    expect(html).toContain('ASCII');
  });
});

describe('renderImportResultPage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      success: false,
      recordCount: 0,
      error: null,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderImportResultPage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title', () => {
    const html = renderImportResultPage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token', () => {
    const html = renderImportResultPage(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  describe('when success is true', () => {
    test('renders alert-success', () => {
      const html = renderImportResultPage(baseParams({
        success: true,
        recordCount: 42,
      }));
      expect(html).toContain('alert-success');
    });

    test('includes the record count in success message', () => {
      const html = renderImportResultPage(baseParams({
        success: true,
        recordCount: 42,
      }));
      expect(html).toContain('42 records');
    });

    test('links to /admin/trees/manage/{tree}', () => {
      const html = renderImportResultPage(baseParams({
        success: true,
      }));
      expect(html).toContain('/admin/trees/manage/ophir');
    });

    test('does not render error message', () => {
      const html = renderImportResultPage(baseParams({
        success: true,
      }));
      expect(html).not.toContain('alert-danger');
    });
  });

  describe('when success is false', () => {
    test('renders alert-danger', () => {
      const html = renderImportResultPage(baseParams({
        success: false,
        error: 'Import failed',
      }));
      expect(html).toContain('alert-danger');
    });

    test('includes the error message', () => {
      const html = renderImportResultPage(baseParams({
        success: false,
        error: 'Custom error text',
      }));
      expect(html).toContain('Custom error text');
    });

    test('HTML-escapes the error message', () => {
      const html = renderImportResultPage(baseParams({
        success: false,
        error: 'Error: <script>bad</script>&"',
      }));
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
      expect(html).not.toContain('<script>bad</script>');
    });

    test('links back to /tree/{tree}/import', () => {
      const html = renderImportResultPage(baseParams({
        success: false,
      }));
      expect(html).toContain('/tree/ophir/import');
    });

    test('handles null error gracefully', () => {
      const html = renderImportResultPage(baseParams({
        success: false,
        error: null,
      }));
      expect(html).toContain('alert-danger');
      expect(html).toContain('could not be imported');
    });
  });

  test('HTML-escapes the tree title', () => {
    const html = renderImportResultPage(baseParams({
      tree: { gedcom_name: 'test', title: '<script>alert("xss")</script>' },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('HTML-escapes the tree name in links', () => {
    const html = renderImportResultPage(baseParams({
      tree: { gedcom_name: 'test<>&"', title: 'Test' },
      success: true,
    }));
    expect(html).toContain(encodeURIComponent('test<>&"'));
  });
});
