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
import { renderFactEditLinks, renderAddFactRow, renderEditRecordLink } from '../pages-server/fact-edit-links-view.mjs';

describe('renderFactEditLinks', () => {
  test('renders edit/copy/delete links pointing at the owning record', () => {
    const html = renderFactEditLinks({ treeName: 'tree1', recordType: 'FAM', recordXref: 'F1', factId: 'abcd1234' });
    expect(html).toContain('href="/tree/tree1/edit-fact/F1/abcd1234"');
    expect(html).toContain('data-wt-post-url="/tree/tree1/copy/F1/abcd1234"');
    expect(html).toContain('data-wt-post-url="/tree/tree1/delete/F1/abcd1234"');
  });

  test('includes a return url when given', () => {
    const html = renderFactEditLinks({ treeName: 'tree1', recordType: 'INDI', recordXref: 'I1', factId: 'abcd', returnUrl: '/tree/tree1/individual/I1' });
    expect(html).toContain('edit-fact/I1/abcd?url=%2Ftree%2Ftree1%2Findividual%2FI1');
  });

  test('includes a delete confirmation prompt', () => {
    const html = renderFactEditLinks({ treeName: 'tree1', recordType: 'INDI', recordXref: 'I1', factId: 'abcd' });
    expect(html).toContain('data-wt-confirm=');
  });
});

describe('renderAddFactRow', () => {
  test('renders one option per addable fact', () => {
    const html = renderAddFactRow({
      treeName: 'tree1',
      recordXref: 'I1',
      addFacts: [
        { tag: 'OCCU', label: 'Occupation' },
        { tag: 'RESI', label: 'Residence' },
      ],
    });

    expect(html).toContain('<option value="OCCU">Occupation</option>');
    expect(html).toContain('<option value="RESI">Residence</option>');
    expect(html).toContain('action="/tree/tree1/add-fact/I1"');
  });

  test('renders nothing when there are no addable facts', () => {
    expect(renderAddFactRow({ treeName: 'tree1', recordXref: 'I1', addFacts: [] })).toBe('');
  });
});

describe('renderEditRecordLink', () => {
  test('links to the edit-record page', () => {
    expect(renderEditRecordLink({ treeName: 'tree1', recordXref: 'I1' })).toContain('href="/tree/tree1/edit-record/I1"');
  });
});
