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
import { loadFamily, childrenXrefs, displayableFamilyFacts, familyCanShowRecord } from '../pages-server/family.mjs';
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

describe('displayableFamilyFacts', () => {
  test('drops HUSB/WIFE/CHIL membership links, keeps every other fact (matches FamilyPage.php\'s own filter exactly - no further narrowing)', () => {
    const facts = parseFacts(
      '1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 MARR\n2 DATE 17 AUG 1995\n1 DIV\n2 DATE 1 JAN 2000\n1 RESI\n2 DATE 27 APR 1996\n1 CHAN\n2 DATE 1 JAN 2020',
    );

    const displayable = displayableFamilyFacts(facts);
    expect(displayable).toHaveLength(4);
    expect(displayable[0]).toContain('1 MARR');
    expect(displayable[1]).toContain('1 DIV');
    expect(displayable[2]).toContain('1 RESI');
    expect(displayable[3]).toContain('1 CHAN');
  });

  test('a family with only membership links returns an empty array', () => {
    expect(displayableFamilyFacts(parseFacts('1 HUSB @I1@\n1 WIFE @I2@'))).toEqual([]);
  });

  // Regression test: the record's own leading "0 @Fn@ FAM" line is
  // never stripped by parseFacts() (by design - every OTHER caller in
  // this codebase uses an allowlist check that naturally excludes it),
  // but this function's denylist shape let it slip through as a fake
  // empty-tag fact row - caught live, rendered as a literal
  // "undefined" label/icon above the real facts.
  test("the record's own leading '0 @Fn@ FAM' line is excluded, not treated as a fact", () => {
    const facts = parseFacts('0 @F1@ FAM\n1 HUSB @I1@\n1 MARR\n2 DATE 17 AUG 1995');

    const displayable = displayableFamilyFacts(facts);
    expect(displayable).toHaveLength(1);
    expect(displayable[0]).toContain('1 MARR');
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
