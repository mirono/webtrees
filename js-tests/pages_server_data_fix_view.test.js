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
import {
  renderDataFixChoosePage,
  renderDataFixPage,
  renderDataFixPreviewFragment,
} from '../pages-server/data-fix-view.mjs';

describe('renderDataFixChoosePage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      dataFixes: [
        { name: 'fix-add-death', title: 'Add missing death records' },
        { name: 'fix-ceme-tag', title: 'Convert INDI:BURI:CEME tags to GEDCOM 5.5.1' },
      ],
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title in the page', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes breadcrumb navigation', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('Control panel');
    expect(html).toContain('Manage family trees');
    expect(html).toContain('Data fixes');
  });

  test('includes the CSRF token', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  test('includes form with POST method', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/tree/ophir/data-fix"');
  });

  test('includes select dropdown for data-fix selection', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('name="data_fix"');
    expect(html).toContain('id="data_fix"');
    expect(html).toContain('<select');
  });

  test('includes all data-fix options in dropdown', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('fix-add-death');
    expect(html).toContain('Add missing death records');
    expect(html).toContain('fix-ceme-tag');
    expect(html).toContain('Convert INDI:BURI:CEME tags to GEDCOM 5.5.1');
  });

  test('includes submit button', () => {
    const html = renderDataFixChoosePage(baseParams());
    expect(html).toContain('type="submit"');
    expect(html).toContain('next');
  });

  test('escapes tree name in URL', () => {
    const html = renderDataFixChoosePage(baseParams({
      tree: {
        gedcom_name: 'my tree',
        title: 'My Tree',
      },
    }));
    expect(html).toContain('my%20tree');
  });

  test('escapes HTML in tree title', () => {
    const html = renderDataFixChoosePage(baseParams({
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir <Script>Alert</Script>',
      },
    }));
    expect(html).toContain('&lt;Script&gt;');
    expect(html).not.toContain('<Script>');
  });

  test('escapes HTML in fix title', () => {
    const html = renderDataFixChoosePage(baseParams({
      dataFixes: [
        { name: 'test-fix', title: 'Fix <bad>tags</bad>' },
      ],
    }));
    expect(html).toContain('&lt;bad&gt;');
    expect(html).not.toContain('<bad>');
  });
});

describe('renderDataFixPage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      dataFix: {
        name: 'fix-add-death',
        title: 'Add missing death records',
        description: 'Add death records where they can be inferred from other dates.',
        optionsHtml: '',
      },
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderDataFixPage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the data-fix title in the page', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('Add missing death records');
  });

  test('includes breadcrumb navigation', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('Control panel');
    expect(html).toContain('Manage family trees');
    expect(html).toContain('Data fixes');
  });

  test('includes the CSRF token', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  test('includes data-fix description', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('Add death records where they can be inferred from other dates.');
  });

  test('includes options HTML when provided', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'fix-ceme-tag',
        title: 'Convert INDI:BURI:CEME tags to GEDCOM 5.5.1',
        description: 'Replace cemetery tags with burial places.',
        optionsHtml: '<input type="radio" name="convert" value="ADDR">',
      },
    }));
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="convert"');
  });

  test('includes search button', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('id="btn-search"');
    expect(html).toContain('search');
  });

  test('includes update-all button', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('id="btn-update-all"');
    expect(html).toContain('update all');
  });

  test('includes results table structure', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('id="data-fix-table"');
    expect(html).toContain('thead');
    expect(html).toContain('tbody');
    expect(html).toContain('Record');
    expect(html).toContain('Data fix');
  });

  test('includes pagination controls', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('id="btn-prev-page"');
    expect(html).toContain('id="btn-next-page"');
    expect(html).toContain('previous');
  });

  test('includes progress bar', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('data-fix-progress');
    expect(html).toContain('progress-bar');
  });

  test('includes JavaScript for search functionality', () => {
    const html = renderDataFixPage(baseParams());
    expect(html).toContain('script');
    expect(html).toContain('btn-search');
    expect(html).toContain('renderPage');
  });

  test('includes correct data URL in JavaScript', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'my-fix',
        title: 'My Fix',
        description: 'Test',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('/tree/ophir/data-fix/my-fix/data');
  });

  test('includes correct update-all URL in JavaScript', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'my-fix',
        title: 'My Fix',
        description: 'Test',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('/tree/ophir/data-fix/my-fix/update-all');
  });

  test('escapes tree name in URLs', () => {
    const html = renderDataFixPage(baseParams({
      tree: {
        gedcom_name: 'my tree',
        title: 'My Tree',
      },
      dataFix: {
        name: 'my-fix',
        title: 'My Fix',
        description: 'Test',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('my%20tree');
  });

  test('escapes data-fix name in URLs', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'my fix name',
        title: 'My Fix',
        description: 'Test',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('my%20fix%20name');
  });

  test('escapes HTML in title', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'fix-test',
        title: 'Fix <Script>Alert</Script>',
        description: 'Test',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('&lt;Script&gt;');
    expect(html).not.toContain('<Script>');
  });

  test('escapes HTML in description', () => {
    const html = renderDataFixPage(baseParams({
      dataFix: {
        name: 'fix-test',
        title: 'Fix Test',
        description: 'Description with <tag>',
        optionsHtml: '',
      },
    }));
    expect(html).toContain('&lt;tag&gt;');
    expect(html).not.toContain('<tag>');
  });
});

describe('renderDataFixPreviewFragment', () => {
  test('returns a string', () => {
    const html = renderDataFixPreviewFragment({ title: 'Test', preview: '' });
    expect(typeof html).toBe('string');
  });

  test('includes HTML structure', () => {
    const html = renderDataFixPreviewFragment({ title: 'Test', preview: '' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  test('includes title in page head', () => {
    const html = renderDataFixPreviewFragment({ title: 'Preview Test', preview: '' });
    expect(html).toContain('<title>Preview Test</title>');
  });

  test('includes title in body', () => {
    const html = renderDataFixPreviewFragment({ title: 'Preview Test', preview: '' });
    expect(html).toContain('<h3>Preview Test</h3>');
  });

  test('shows "does not need to be updated" message when preview is empty', () => {
    const html = renderDataFixPreviewFragment({ title: 'Test', preview: '' });
    expect(html).toContain('This record does not need to be updated.');
  });

  test('includes preview content when provided', () => {
    const preview = '<del>old</del><ins>new</ins>';
    const html = renderDataFixPreviewFragment({ title: 'Test', preview });
    expect(html).toContain(preview);
  });

  test('does not show "does not need" message when preview provided', () => {
    const preview = '<del>old</del><ins>new</ins>';
    const html = renderDataFixPreviewFragment({ title: 'Test', preview });
    expect(html).not.toContain('does not need to be updated');
  });

  test('escapes HTML in title', () => {
    const html = renderDataFixPreviewFragment({ title: 'Test <Script>Alert</Script>', preview: '' });
    expect(html).toContain('&lt;Script&gt;');
    expect(html).not.toContain('<Script>');
  });

  test('includes charset meta tag', () => {
    const html = renderDataFixPreviewFragment({ title: 'Test', preview: '' });
    expect(html).toContain('charset="UTF-8"');
  });
});
