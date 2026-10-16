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
import {
  surnameData,
  allSurns,
  allSurnames,
  surnameInitials,
  givenNameInitials,
  familyXrefsForSurnames,
  filterSurnamesForAlpha,
  computeSurnsToShow,
} from '../pages-server/family-list.mjs';

function mockPool(rows) {
  return { query: vi.fn(async () => ({ rows })) };
}

describe('surnameData', () => {
  test('queries wt_name joined to wt_link on FAMS, scoped to the tree', async () => {
    const pool = mockPool([{ n_surn: 'SMITH', n_surname: 'Smith', total: '3' }]);

    const data = await surnameData(pool, 1, true);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('wt_name');
    expect(sql).toContain("l_type = 'FAMS'");
    expect(params).toEqual([1]);
    expect(data).toEqual([{ n_surn: 'SMITH', n_surname: 'Smith', total: 3 }]);
  });

  test('excludes married names when marnm is false', async () => {
    const pool = mockPool([]);
    await surnameData(pool, 1, false);
    expect(pool.query.mock.calls[0][0]).toContain("n_type <> '_MARNM'");
  });

  test('includes married names when marnm is true', async () => {
    const pool = mockPool([]);
    await surnameData(pool, 1, true);
    expect(pool.query.mock.calls[0][0]).not.toContain("n_type <> '_MARNM'");
  });
});

describe('allSurns', () => {
  test('groups raw spellings under their normalized/uppercased form', () => {
    const data = [
      { n_surn: 'Smith', n_surname: 'Smith', total: 2 },
      { n_surn: 'SMITH', n_surname: 'Smith', total: 1 },
      { n_surn: 'Müller', n_surname: 'Müller', total: 1 },
    ];

    const result = allSurns(data);

    expect(result.get('SMITH')).toEqual(['Smith', 'SMITH']);
    expect(result.get('MULLER')).toEqual(['Müller']);
  });

  test('is sorted by locale collation, not insertion order', () => {
    const data = [
      { n_surn: 'Zebra', n_surname: 'Zebra', total: 1 },
      { n_surn: 'Apple', n_surname: 'Apple', total: 1 },
    ];

    expect([...allSurns(data).keys()]).toEqual(['APPLE', 'ZEBRA']);
  });
});

describe('allSurnames', () => {
  test('groups display surnames by normalized n_surn, with per-spelling totals', () => {
    const data = [
      { n_surn: 'SMITH', n_surname: 'Smith', total: 2 },
      { n_surn: 'SMITH', n_surname: 'SMYTHE', total: 1 },
    ];

    const result = allSurnames(data);
    const inner = result.get('SMITH');

    expect(inner.get('Smith')).toBe(2);
    expect(inner.get('SMYTHE')).toBe(1);
  });

  test('falls back to n_surname as the grouping key when n_surn is empty', () => {
    const data = [{ n_surn: '', n_surname: 'Smith', total: 1 }];
    const result = allSurnames(data);
    expect(result.has('SMITH')).toBe(true);
  });

  test('sums totals for the same exact spelling across rows', () => {
    const data = [
      { n_surn: 'SMITH', n_surname: 'Smith', total: 2 },
      { n_surn: 'SMITH', n_surname: 'Smith', total: 3 },
    ];

    expect(allSurnames(data).get('SMITH').get('Smith')).toBe(5);
  });
});

describe('surnameInitials', () => {
  test('seeds every alphabet letter at 0', () => {
    const initials = surnameInitials([]);
    expect(initials.get('A')).toBe(0);
    expect(initials.get('Z')).toBe(0);
    expect(initials.size).toBe(26);
  });

  test('counts real surnames by their normalized initial', () => {
    const data = [
      { n_surn: 'Smith', n_surname: 'Smith', total: 3 },
      { n_surn: 'Müller', n_surname: 'Müller', total: 2 },
    ];

    const initials = surnameInitials(data);
    expect(initials.get('S')).toBe(3);
    expect(initials.get('M')).toBe(2);
  });

  test('moves the "no surname" bucket to the "," key', () => {
    const initials = surnameInitials([{ n_surn: '', n_surname: '', total: 4 }]);
    expect(initials.has('')).toBe(false);
    expect(initials.get(',')).toBe(4);
  });

  test('moves the unknown-surname ("@N.N.") bucket to the end, under "@"', () => {
    const data = [{ n_surn: '@N.N.', n_surname: '@N.N.', total: 1 }];
    const initials = surnameInitials(data);
    const keys = [...initials.keys()];
    expect(keys[keys.length - 1]).toBe('@');
    expect(initials.get('@')).toBe(1);
  });
});

describe('givenNameInitials', () => {
  test('queries wt_name joined to wt_link on FAMS', async () => {
    const pool = mockPool([{ n_givn: 'John', total: '2' }]);
    const initials = await givenNameInitials(pool, 1, [], true);

    expect(pool.query.mock.calls[0][0]).toContain("l_type = 'FAMS'");
    expect(initials.get('J')).toBe(2);
  });

  test('filters by surns when given', async () => {
    const pool = mockPool([]);
    await givenNameInitials(pool, 1, ['SMITH'], true);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('n_surn = ANY(');
    expect(params).toEqual([1, ['SMITH']]);
  });

  test('moves the unknown-given-name ("@P.N.") bucket to the end, under "@"', async () => {
    const pool = mockPool([{ n_givn: '@P.N.', total: '5' }]);
    const initials = await givenNameInitials(pool, 1, [], true);

    expect(initials.get('@')).toBe(5);
  });

  test('does NOT remap a genuinely blank given name to "," - unlike surnameInitials, real PHP has no such case here', async () => {
    const pool = mockPool([{ n_givn: '', total: '3' }]);
    const initials = await givenNameInitials(pool, 1, [], true);

    expect(initials.has(',')).toBe(false);
    expect(initials.get('')).toBe(3);
  });
});

describe('familyXrefsForSurnames', () => {
  test('returns distinct family xrefs', async () => {
    const pool = mockPool([
      { family_xref: 'F1', n_givn: 'John' },
      { family_xref: 'F1', n_givn: 'John' },
      { family_xref: 'F2', n_givn: 'Jane' },
    ]);

    const xrefs = await familyXrefsForSurnames(pool, 1, ['SMITH'], '', true);
    expect(xrefs.sort()).toEqual(['F1', 'F2']);
  });

  test('excludes blank/unknown surnames by default when surnsToShow is empty', async () => {
    const pool = mockPool([]);
    await familyXrefsForSurnames(pool, 1, [], '', true);

    expect(pool.query.mock.calls[0][0]).toContain("n_surn NOT IN ('', '@N.N.')");
  });

  test('filters by given-name initial in JS, not SQL', async () => {
    const pool = mockPool([
      { family_xref: 'F1', n_givn: 'John' },
      { family_xref: 'F2', n_givn: 'Zara' },
    ]);

    const xrefs = await familyXrefsForSurnames(pool, 1, ['SMITH'], 'J', true);
    expect(xrefs).toEqual(['F1']);
  });

  test('never emits malformed SQL for the galpha-filtered case', async () => {
    const pool = mockPool([]);
    await familyXrefsForSurnames(pool, 1, ['SMITH'], 'J', true);

    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toContain('LATERAL');
  });
});

describe('filterSurnamesForAlpha', () => {
  const surnames = new Map([
    ['SMITH', new Map([['Smith', 5]])],
    ['JONES', new Map([['Jones', 3]])],
    ['', new Map([['', 2]])],
    ['@N.N.', new Map([['@N.N.', 1]])],
  ]);

  test('alpha="@" keeps only the unknown-surname bucket', () => {
    expect([...filterSurnamesForAlpha(surnames, { alpha: '@', surname: '', showAll: 'no' }).keys()]).toEqual(['@N.N.']);
  });

  test('alpha="," keeps only the no-surname bucket', () => {
    expect([...filterSurnamesForAlpha(surnames, { alpha: ',', surname: '', showAll: 'no' }).keys()]).toEqual(['']);
  });

  test('alpha="" + showAll=yes keeps every REAL surname (excludes blank and unknown)', () => {
    const result = [...filterSurnamesForAlpha(surnames, { alpha: '', surname: '', showAll: 'yes' }).keys()];
    expect(result.sort()).toEqual(['JONES', 'SMITH']);
  });

  test('alpha="" + showAll=no keeps only the exact surname', () => {
    expect([...filterSurnamesForAlpha(surnames, { alpha: '', surname: 'SMITH', showAll: 'no' }).keys()]).toEqual(['SMITH']);
  });

  test('a plain alpha letter with no surname selected keeps every surname starting with it', () => {
    expect([...filterSurnamesForAlpha(surnames, { alpha: 'S', surname: '', showAll: 'no' }).keys()]).toEqual(['SMITH']);
  });

  test('a plain alpha letter WITH a surname already selected ignores the letter, keeps only that surname', () => {
    expect([...filterSurnamesForAlpha(surnames, { alpha: 'J', surname: 'SMITH', showAll: 'no' }).keys()]).toEqual(['SMITH']);
  });
});

describe('computeSurnsToShow', () => {
  const allSurns = new Map([
    ['SMITH', ['Smith', 'SMITH']],
    ['SMYTHE', ['Smythe']],
    ['JONES', ['Jones']],
  ]);

  test('alpha="@" returns only the NOMEN_NESCIO sentinel', () => {
    expect(computeSurnsToShow(allSurns, { alpha: '@', surname: '' })).toEqual(['@N.N.']);
  });

  test('alpha="," returns only the blank surname', () => {
    expect(computeSurnsToShow(allSurns, { alpha: ',', surname: '' })).toEqual(['']);
  });

  test('a surname returns every real spelling under that canonical key', () => {
    expect(computeSurnsToShow(allSurns, { alpha: '', surname: 'SMITH' })).toEqual(['Smith', 'SMITH']);
  });

  test('a plain alpha letter with no surname returns every spelling under every matching canonical key', () => {
    const result = computeSurnsToShow(allSurns, { alpha: 'S', surname: '' });
    expect(result.sort()).toEqual(['SMITH', 'Smith', 'Smythe'].sort());
  });

  test('no alpha and no surname means "show everything" (empty array)', () => {
    expect(computeSurnsToShow(allSurns, { alpha: '', surname: '' })).toEqual([]);
  });
});
