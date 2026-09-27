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

import { describe, expect, test, vi } from 'vitest';
import { loadNote, noteCanShowRecord, noteText } from '../pages-server/note.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadNote', () => {
  test('returns the raw gedcom blob for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'NOTE'");
      expect(params).toEqual(['N1', 1]);
      return { rows: [{ o_id: 'N1', o_gedcom: '0 @N1@ NOTE Some shared note text' }] };
    });

    expect(await loadNote(pool, 1, 'N1')).toEqual({ xref: 'N1', gedcom: '0 @N1@ NOTE Some shared note text' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadNote(pool, 1, 'N999')).toBeNull();
  });
});

describe('noteCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown', () => {
    expect(noteCanShowRecord({ ...baseTree, hideLivePeople: false }, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('no tree-wide NOTE default-resn row -> public by default (base GedcomRecord::canShowByType())', () => {
    expect(noteCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('a tree-wide NOTE default-resn row gates by access level', () => {
    const treeFactResn = new Map([['NOTE', 'confidential']]);

    expect(noteCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, treeFactResn)).toBe(true);
    expect(noteCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 1 }, treeFactResn)).toBe(false);
  });

  test('an inline RESN on the note record itself still applies (shared RESN chain)', () => {
    const gedcom = '0 @N1@ NOTE Text\n1 RESN confidential';

    expect(noteCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 2 }, new Map())).toBe(false);
    expect(noteCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });
});

describe('noteText', () => {
  test('a single-line note', () => {
    expect(noteText('0 @N1@ NOTE Some shared note text')).toBe('Some shared note text');
  });

  test('joins CONT/CONC continuation lines', () => {
    const gedcom = '0 @N1@ NOTE line one\n1 CONT line two\n1 CONC -continued';

    expect(noteText(gedcom)).toBe('line one\nline two-continued');
  });

  test('a note with no value returns an empty string', () => {
    expect(noteText('0 @N1@ NOTE')).toBe('');
  });
});
