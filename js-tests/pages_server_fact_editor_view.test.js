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
  renderEditFactPage,
  renderEditRecordPage,
  renderRawGedcomFactPage,
  renderRawGedcomRecordPage,
} from '../pages-server/fact-editor-view.mjs';

const TREE = { name: 'tree1', title: 'My Tree' };
const USER = { realName: 'Jane Editor' };

describe('renderEditFactPage', () => {
  function base(overrides = {}) {
    return {
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'John Doe - Occupation',
      actionUrl: '/tree/tree1/update-fact/I1/abcd',
      fieldsHtml: '<div class="row mb-3">FIELDS</div>',
      url: '/tree/tree1/individual/I1',
      keepChanChecked: false,
      hiddenUrl: '',
      canEditRaw: false,
      ...overrides,
    };
  }

  test('renders the title, form action, and widget fields', () => {
    const html = renderEditFactPage(base());
    expect(html).toContain('John Doe - Occupation');
    expect(html).toContain('action="/tree/tree1/update-fact/I1/abcd"');
    expect(html).toContain('FIELDS');
    expect(html).toContain('value="/tree/tree1/individual/I1"');
  });

  test('includes a CSRF hidden field', () => {
    const html = renderEditFactPage(base());
    expect(html).toContain('name="_csrf" value="tok"');
  });

  test('shows the "edit with all GEDCOM tags" link only when hiddenUrl is set', () => {
    expect(renderEditFactPage(base())).not.toContain('Edit with all GEDCOM tags');
    const html = renderEditFactPage(base({ hiddenUrl: '/tree/tree1/add-fact/I1/OCCU?include_hidden=1' }));
    expect(html).toContain('Edit with all GEDCOM tags');
    expect(html).toContain('/tree/tree1/add-fact/I1/OCCU?include_hidden=1');
  });

  test('shows the raw-GEDCOM link only when canEditRaw is true', () => {
    expect(renderEditFactPage(base())).not.toContain('Edit the raw GEDCOM');
    const html = renderEditFactPage(base({ canEditRaw: true, rawEditUrl: '/tree/tree1/edit-raw/I1/abcd' }));
    expect(html).toContain('Edit the raw GEDCOM');
    expect(html).toContain('/tree/tree1/edit-raw/I1/abcd');
  });

  test('checks the keep_chan checkbox when requested', () => {
    expect(renderEditFactPage(base())).not.toContain('checked="checked"');
    expect(renderEditFactPage(base({ keepChanChecked: true }))).toContain('checked="checked"');
  });

  test('escapes user-controlled values', () => {
    const html = renderEditFactPage(base({ url: '"><script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('renderEditRecordPage', () => {
  function base(overrides = {}) {
    return {
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'John Doe',
      actionUrl: '/tree/tree1/update-record/I1',
      fieldsHtml: '<div>FIELDS</div>',
      cancelUrl: '/tree/tree1/individual/I1',
      hasChan: true,
      keepChanChecked: false,
      hiddenUrl: '',
      canEditRaw: false,
      ...overrides,
    };
  }

  test('renders the keep_chan checkbox only when hasChan is true', () => {
    expect(renderEditRecordPage(base())).toContain('name="keep_chan"');
    expect(renderEditRecordPage(base({ hasChan: false }))).not.toContain('name="keep_chan"');
  });

  test('renders the action URL and fields', () => {
    const html = renderEditRecordPage(base());
    expect(html).toContain('action="/tree/tree1/update-record/I1"');
    expect(html).toContain('FIELDS');
  });
});

describe('renderRawGedcomFactPage', () => {
  test('renders the summary label and raw gedcom text', () => {
    const html = renderRawGedcomFactPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Edit the raw GEDCOM - John Doe',
      actionUrl: '/tree/tree1/edit-raw/I1/abcd',
      url: '/tree/tree1/individual/I1',
      summary: 'Occupation: farmer',
      gedcom: '1 OCCU farmer\n2 DATE 1900',
      cancelUrl: '/tree/tree1/individual/I1',
    });

    expect(html).toContain('Occupation: farmer');
    expect(html).toContain('1 OCCU farmer\n2 DATE 1900');
    expect(html).toContain('action="/tree/tree1/edit-raw/I1/abcd"');
  });

  test('escapes gedcom text containing HTML-like content', () => {
    const html = renderRawGedcomFactPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 't',
      actionUrl: '/a',
      url: '/u',
      summary: 's',
      gedcom: '1 NOTE <script>alert(1)</script>',
      cancelUrl: '/u',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('renderRawGedcomRecordPage', () => {
  test('renders the level0 line and one textarea per fact', () => {
    const html = renderRawGedcomRecordPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'John Doe',
      actionUrl: '/tree/tree1/edit-raw/I1',
      level0: '0 @I1@ INDI',
      facts: [
        { id: 'aaa', tag: 'NAME', summary: 'Name: John Doe', gedcom: '1 NAME John /Doe/' },
        { id: 'bbb', tag: 'SEX', summary: 'Sex: Male', gedcom: '1 SEX M' },
      ],
      cancelUrl: '/tree/tree1/individual/I1',
    });

    expect(html).toContain('0 @I1@ INDI');
    expect(html).toContain('1 NAME John /Doe/');
    expect(html).toContain('1 SEX M');
    expect(html).toContain('Name: John Doe');
    expect(html).toContain('Sex: Male');
    expect(html).toContain('name="fact_id[]" value="aaa"');
    expect(html).toContain('name="fact_id[]" value="bbb"');
  });

  test('warns about renaming the file for an OBJE:FILE fact', () => {
    const html = renderRawGedcomRecordPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Media object',
      actionUrl: '/a',
      level0: '0 @M1@ OBJE',
      facts: [{ id: 'ccc', tag: 'FILE', summary: 'File: photo.jpg', gedcom: '1 FILE photo.jpg' }],
      cancelUrl: '/u',
    });

    expect(html).toContain('If you modify the filename, you should also rename the file.');
  });

  test('includes an empty "add a fact" textarea at the end', () => {
    const html = renderRawGedcomRecordPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'John Doe',
      actionUrl: '/a',
      level0: '0 @I1@ INDI',
      facts: [],
      cancelUrl: '/u',
    });

    expect(html).toContain('id="fact-add"');
    expect(html).toContain('Add a fact');
  });
});
