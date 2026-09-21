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
import { loadFamily, childrenXrefs, vitalFamilyFacts, familyCanShowRecord } from '../pages-server/family.mjs';
import { parseFacts } from '../pages-server/individual.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadFamily', () => {
  test('returns the raw gedcom blob plus husb/wife xrefs for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_families');
      expect(params).toEqual(['F1', 1]);
      return { rows: [{ f_id: 'F1', f_gedcom: '0 @F1@ FAM', f_husb: 'I1', f_wife: 'I2' }] };
    });

    expect(await loadFamily(pool, 1, 'F1')).toEqual({ xref: 'F1', gedcom: '0 @F1@ FAM', husb: 'I1', wife: 'I2' });
  });

  test('husb/wife are null when absent', async () => {
    const pool = mockPool(async () => ({ rows: [{ f_id: 'F1', f_gedcom: '0 @F1@ FAM', f_husb: null, f_wife: null }] }));

    const family = await loadFamily(pool, 1, 'F1');
    expect(family.husb).toBeNull();
    expect(family.wife).toBeNull();
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadFamily(pool, 1, 'F999')).toBeNull();
  });
});

describe('childrenXrefs', () => {
  test('extracts CHIL xrefs in document order', () => {
    const facts = parseFacts('1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 CHIL @I4@\n1 MARR');

    expect(childrenXrefs(facts)).toEqual(['I3', 'I4']);
  });

  test('no children -> empty array', () => {
    expect(childrenXrefs(parseFacts('1 HUSB @I1@\n1 WIFE @I2@'))).toEqual([]);
  });
});

describe('vitalFamilyFacts', () => {
  test('keeps MARR/DIV/ANUL/_SEPR, drops everything else including membership links', () => {
    const facts = parseFacts('1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 MARR\n2 DATE 17 AUG 1995\n1 DIV\n2 DATE 1 JAN 2000\n1 CHAN\n2 DATE 1 JAN 2020');

    const vital = vitalFamilyFacts(facts);
    expect(vital).toHaveLength(2);
    expect(vital[0]).toContain('1 MARR');
    expect(vital[1]).toContain('1 DIV');
  });

  test('a family with no vital facts returns an empty array', () => {
    expect(vitalFamilyFacts(parseFacts('1 HUSB @I1@\n1 WIFE @I2@'))).toEqual([]);
  });
});

describe('familyCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown, even with hidden members', () => {
    expect(familyCanShowRecord({ ...baseTree, hideLivePeople: false }, '', baseViewer, [false])).toBe(true);
  });

  test('every referenced member showable -> family shown', () => {
    expect(familyCanShowRecord(baseTree, '', baseViewer, [true, true, true])).toBe(true);
  });

  test('any one referenced member not showable -> whole family hidden', () => {
    expect(familyCanShowRecord(baseTree, '', baseViewer, [true, false, true])).toBe(false);
  });

  test('no referenced members at all (empty array) -> vacuously shown', () => {
    expect(familyCanShowRecord(baseTree, '', baseViewer, [])).toBe(true);
  });

  test('an inline RESN on the family record itself still applies (shared RESN chain)', () => {
    expect(familyCanShowRecord(baseTree, '1 HUSB @I1@\n1 RESN confidential', { ...baseViewer, accessLevel: 2 }, [true, true])).toBe(
      false,
    );
    expect(familyCanShowRecord(baseTree, '1 HUSB @I1@\n1 RESN confidential', { ...baseViewer, accessLevel: 0 }, [true, true])).toBe(
      true,
    );
  });

  test('admin bypass applies before ever checking member visibility', () => {
    expect(familyCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, [false, false])).toBe(true);
  });
});
