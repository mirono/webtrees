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
  renderMergeStep1Page,
  renderMergeStep2Page,
  renderMergeResultPage,
} from '../pages-server/record-merge-view.mjs';

describe('renderMergeStep1Page', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      type: 'INDI',
      xref1: '',
      xref2: '',
      records: [
        { xref: 'I1', label: 'John Doe' },
        { xref: 'I2', label: 'Jane Doe' },
      ],
      error: null,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title in the page', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  test('includes type dropdown with all mergeable types', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('<select');
    expect(html).toContain('name="type"');
    expect(html).toContain('INDI');
    expect(html).toContain('FAM');
    expect(html).toContain('SOUR');
    expect(html).toContain('REPO');
    expect(html).toContain('NOTE');
    expect(html).toContain('OBJE');
    expect(html).toContain('SUBM');
    expect(html).toContain('_LOC');
  });

  test('marks the current type as selected in dropdown', () => {
    const html = renderMergeStep1Page(baseParams({ type: 'FAM' }));
    const faMatcher = /value="FAM"[^>]*selected/;
    expect(faMatcher.test(html)).toBe(true);
  });

  test('includes human-readable labels for each type', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('Individual');
    expect(html).toContain('Family');
    expect(html).toContain('Source');
  });

  test('populates xref1 select with records', () => {
    const html = renderMergeStep1Page(baseParams({
      records: [
        { xref: 'I1', label: 'John Doe' },
        { xref: 'I2', label: 'Jane Doe' },
      ],
    }));
    expect(html).toContain('name="xref1"');
    expect(html).toContain('value="I1"');
    expect(html).toContain('John Doe');
    expect(html).toContain('Jane Doe');
  });

  test('populates xref2 select with records', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('name="xref2"');
  });

  test('marks xref1 as selected when provided', () => {
    const html = renderMergeStep1Page(baseParams({
      xref1: 'I1',
      records: [
        { xref: 'I1', label: 'John Doe' },
        { xref: 'I2', label: 'Jane Doe' },
      ],
    }));
    const i1Matcher = /value="I1"[^>]*selected/;
    expect(i1Matcher.test(html)).toBe(true);
  });

  test('marks xref2 as selected when provided', () => {
    const html = renderMergeStep1Page(baseParams({
      xref2: 'I2',
      records: [
        { xref: 'I1', label: 'John Doe' },
        { xref: 'I2', label: 'Jane Doe' },
      ],
    }));
    const matches = html.match(/value="I2"[^>]*selected/g);
    expect(matches).not.toBeNull();
  });

  test('renders "No records of this type." when records array is empty', () => {
    const html = renderMergeStep1Page(baseParams({
      records: [],
    }));
    expect(html).toContain('No records of this type');
  });

  test('disables xref selects when records is empty', () => {
    const html = renderMergeStep1Page(baseParams({
      records: [],
    }));
    expect(html).toContain('disabled');
  });

  test('renders error alert when error is provided', () => {
    const html = renderMergeStep1Page(baseParams({
      error: 'Something went wrong',
    }));
    expect(html).toContain('alert alert-danger');
    expect(html).toContain('Something went wrong');
  });

  test('does not render error alert when error is null', () => {
    const html = renderMergeStep1Page(baseParams({
      error: null,
    }));
    expect(html).not.toContain('alert alert-danger');
  });

  test('HTML-escapes the error message', () => {
    const html = renderMergeStep1Page(baseParams({
      error: '<script>alert("xss")</script>',
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('HTML-escapes record labels', () => {
    const html = renderMergeStep1Page(baseParams({
      records: [
        { xref: 'I1', label: '<script>John</script>' },
      ],
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  test('includes hidden type field in POST form', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="type"');
  });

  test('has continue button', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('continue');
    expect(html).toContain('btn-primary');
  });

  test('form action points to merge-step1', () => {
    const html = renderMergeStep1Page(baseParams());
    expect(html).toContain('/tree/ophir/merge-step1');
  });
});

describe('renderMergeStep2Page', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      xref1: 'I1',
      xref2: 'I2',
      facts: {
        both: [
          { id: 'hash1', gedcom: '1 NAME John /Doe/' },
        ],
        only1: [
          { id: 'hash2', gedcom: '1 SEX M' },
        ],
        only2: [
          { id: 'hash3', gedcom: '1 SEX F' },
        ],
      },
      error: null,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  test('renders facts from both bucket as checkboxes', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('1 NAME John /Doe/');
    expect(html).toContain('name="keep1[]"');
    expect(html).toContain('type="checkbox"');
  });

  test('renders facts from only1 bucket as checkboxes', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('1 SEX M');
    expect(html).toContain('name="keep1[]"');
  });

  test('renders facts from only2 bucket as checkboxes', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('1 SEX F');
    expect(html).toContain('name="keep2[]"');
  });

  test('presets facts.both checkbox to checked', () => {
    const html = renderMergeStep2Page(baseParams());
    const bothFactLine = html.split('1 NAME John /Doe/')[0];
    const lastCheckbox = bothFactLine.match(/type="checkbox"[^>]*checked/g);
    expect(lastCheckbox).not.toBeNull();
  });

  test('presets facts.only1 checkbox to checked', () => {
    const html = renderMergeStep2Page(baseParams());
    const only1Section = html.split('Facts only in')[1];
    const firstCheckboxInOnly1 = only1Section.match(/type="checkbox"[^>]*>/)[0];
    expect(firstCheckboxInOnly1).toContain('checked');
  });

  test('presets facts.only2 checkbox to NOT checked (user decides)', () => {
    const html = renderMergeStep2Page(baseParams({
      facts: {
        both: [],
        only1: [],
        only2: [{ id: 'hash3', gedcom: '1 SEX F' }],
      },
    }));
    const only2Section = html.split('Facts only in')[2];
    const checkboxMatch = only2Section.match(/type="checkbox"[^>]*(?!checked)/);
    expect(checkboxMatch).not.toBeNull();
  });

  test('escapes multi-line facts with line breaks', () => {
    const html = renderMergeStep2Page(baseParams({
      facts: {
        both: [],
        only1: [
          { id: 'hash1', gedcom: '1 NOTE Line 1\n2 CONT Line 2' },
        ],
        only2: [],
      },
    }));
    expect(html).toContain('1 NOTE Line 1<br>2 CONT Line 2');
  });

  test('HTML-escapes fact content', () => {
    const html = renderMergeStep2Page(baseParams({
      facts: {
        both: [
          { id: 'hash1', gedcom: '1 NOTE <script>alert("xss")</script>' },
        ],
        only1: [],
        only2: [],
      },
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('includes hidden xref1 field', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="xref1"');
    expect(html).toContain('value="I1"');
  });

  test('includes hidden xref2 field', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('name="xref2"');
    expect(html).toContain('value="I2"');
  });

  test('shows xref2 will be deleted in text', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('will be deleted');
    expect(html).toContain('I2');
  });

  test('shows xref1 will keep selected facts', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('keep the facts selected');
    expect(html).toContain('I1');
  });

  test('renders error alert when error is provided', () => {
    const html = renderMergeStep2Page(baseParams({
      error: 'Merge failed',
    }));
    expect(html).toContain('alert alert-danger');
    expect(html).toContain('Merge failed');
  });

  test('does not render error alert when error is null', () => {
    const html = renderMergeStep2Page(baseParams({
      error: null,
    }));
    expect(html).not.toContain('alert alert-danger');
  });

  test('form action points to merge-step2', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('/tree/ophir/merge-step2');
  });

  test('includes three section headings for fact buckets', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('Facts and events');
    expect(html).toContain('Facts only in I1');
    expect(html).toContain('Facts only in I2');
  });

  test('has merge button', () => {
    const html = renderMergeStep2Page(baseParams());
    expect(html).toContain('merge');
    expect(html).toContain('btn-primary');
    expect(html).toContain('type="submit"');
  });
});

describe('renderMergeResultPage', () => {
  function baseParams(overrides = {}) {
    return {
      csrfToken: 'test-csrf-token',
      tree: {
        gedcom_name: 'ophir',
        title: 'Ophir Family Tree',
      },
      success: false,
      pending: false,
      error: null,
      ...overrides,
    };
  }

  test('returns a string', () => {
    const html = renderMergeResultPage(baseParams());
    expect(typeof html).toBe('string');
  });

  test('includes the tree title', () => {
    const html = renderMergeResultPage(baseParams());
    expect(html).toContain('Ophir Family Tree');
  });

  test('includes the CSRF token', () => {
    const html = renderMergeResultPage(baseParams());
    expect(html).toContain('test-csrf-token');
  });

  describe('when success is true', () => {
    test('renders alert-success', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: false,
      }));
      expect(html).toContain('alert-success');
    });

    test('shows plain success message when pending is false', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: false,
      }));
      expect(html).toContain('records have been merged');
      expect(html).not.toContain('awaiting moderation');
    });

    test('shows awaiting moderation message when pending is true', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: true,
      }));
      expect(html).toContain('awaiting moderation');
      expect(html).toContain('pending changes');
    });

    test('links to /admin/trees/manage/{tree}', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: false,
      }));
      expect(html).toContain('/admin/trees/manage/ophir');
    });

    test('does not render error message', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: false,
      }));
      expect(html).not.toContain('alert-danger');
    });

    test('continue button is present', () => {
      const html = renderMergeResultPage(baseParams({
        success: true,
        pending: false,
      }));
      expect(html).toContain('continue');
      expect(html).toContain('btn-primary');
    });
  });

  describe('when success is false', () => {
    test('renders alert-danger', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
        error: 'Merge failed',
      }));
      expect(html).toContain('alert-danger');
    });

    test('includes provided error message', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
        error: 'Custom error text',
      }));
      expect(html).toContain('Custom error text');
    });

    test('includes generic error message when error is null', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
        error: null,
      }));
      expect(html).toContain('could not be merged');
    });

    test('HTML-escapes the error message', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
        error: '<script>bad</script>&"',
      }));
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
      expect(html).not.toContain('<script>bad</script>');
    });

    test('links back to /tree/{tree}/merge-step1', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
      }));
      expect(html).toContain('/tree/ophir/merge-step1');
    });

    test('back button is present', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
      }));
      expect(html).toContain('back');
      expect(html).toContain('btn-primary');
    });

    test('ignores pending parameter when success is false', () => {
      const html = renderMergeResultPage(baseParams({
        success: false,
        pending: true,
        error: 'Error',
      }));
      expect(html).not.toContain('awaiting moderation');
    });
  });

  test('HTML-escapes the tree title', () => {
    const html = renderMergeResultPage(baseParams({
      tree: { gedcom_name: 'test', title: '<script>alert("xss")</script>' },
      success: true,
      pending: false,
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
  });

  test('URL-encodes the tree name in links', () => {
    const html = renderMergeResultPage(baseParams({
      tree: { gedcom_name: 'test-tree', title: 'Test' },
      success: true,
      pending: false,
    }));
    expect(html).toContain(encodeURIComponent('test-tree'));
  });
});
