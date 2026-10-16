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
  numberOfChildren,
  getEstimatedBirthDate,
  getEstimatedDeathDate,
  individualRowsForSurnames,
} from '../pages-server/individual-list.mjs';
import { parseFacts } from '../pages-server/individual.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';

function mockPool(handlers) {
  return {
    query: vi.fn(async (sql, params) => {
      for (const [match, result] of handlers) {
        if (sql.includes(match)) {
          return typeof result === 'function' ? result(sql, params) : result;
        }
      }
      return { rows: [] };
    }),
  };
}

describe('numberOfChildren', () => {
  test('an explicit NCHI fact wins outright, no max() with the real count (unlike Family::numberOfChildren)', async () => {
    const pool = { query: vi.fn() };
    const facts = parseFacts('0 @I1@ INDI\n1 NCHI 2');
    expect(await numberOfChildren(pool, 1, 'I1', facts)).toBe(2);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('counts distinct children across every spouse family, deduplicated', async () => {
    const pool = mockPool([
      ['wt_link', { rows: [{ l_type: 'FAMS', l_to: 'F1' }, { l_type: 'FAMS', l_to: 'F2' }] }],
      ['wt_families', (sql, params) => {
        if (params[0] === 'F1') return { rows: [{ f_id: 'F1', f_gedcom: '0 @F1@ FAM\n1 CHIL @C1@\n1 CHIL @C2@', f_husb: null, f_wife: null }] };
        return { rows: [{ f_id: 'F2', f_gedcom: '0 @F2@ FAM\n1 CHIL @C2@\n1 CHIL @C3@', f_husb: null, f_wife: null }] };
      }],
    ]);
    const facts = parseFacts('0 @I1@ INDI\n1 SEX M');
    expect(await numberOfChildren(pool, 1, 'I1', facts)).toBe(3);
  });

  test('no NCHI, no spouse families -> 0', async () => {
    const pool = mockPool([['wt_link', { rows: [] }]]);
    expect(await numberOfChildren(pool, 1, 'I1', parseFacts('0 @I1@ INDI'))).toBe(0);
  });
});

describe('getEstimatedBirthDate', () => {
  test('a real dated birth fact always wins, no DB calls needed', async () => {
    const pool = { query: vi.fn() };
    const facts = parseFacts('0 @I1@ INDI\n1 BIRT\n2 DATE 1 JAN 1900');
    const date = await getEstimatedBirthDate(pool, 1, 'I1', facts, 120);

    expect(date.isOK()).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('no real date and no usable related-family data -> blank (unparseable) date', async () => {
    const pool = mockPool([['wt_link', { rows: [] }]]);
    const facts = parseFacts('0 @I1@ INDI\n1 SEX M');
    const date = await getEstimatedBirthDate(pool, 1, 'I1', facts, 120);

    expect(date.isOK()).toBe(false);
  });

  test('estimates from own death date alone when no family data is available', async () => {
    const pool = mockPool([['wt_link', { rows: [] }]]);
    const facts = parseFacts('0 @I1@ INDI\n1 DEAT\n2 DATE 1 JAN 2000');
    const date = await getEstimatedBirthDate(pool, 1, 'I1', facts, 120);

    expect(date.isOK()).toBe(true);
    // Midpoint of [deathDate - 120y, deathDate] should be a real,
    // earlier year than the death date itself.
    const deathDate = new GedcomDate('1 JAN 2000');
    expect(date.minimumJulianDay()).toBeLessThan(deathDate.minimumJulianDay());
  });

  test('estimates from a parent family (marriage date present, no parent birth dates)', async () => {
    const pool = mockPool([
      ['wt_link', { rows: [{ l_type: 'FAMC', l_to: 'F1' }] }],
      ['wt_families', { rows: [{ f_id: 'F1', f_gedcom: '0 @F1@ FAM\n1 MARR\n2 DATE 1 JAN 1920', f_husb: null, f_wife: null }] }],
    ]);
    const facts = parseFacts('0 @I1@ INDI\n1 SEX M');
    const date = await getEstimatedBirthDate(pool, 1, 'I1', facts, 120);

    expect(date.isOK()).toBe(true);
  });
});

describe('getEstimatedDeathDate', () => {
  test('a real dated death fact always wins', () => {
    const facts = parseFacts('0 @I1@ INDI\n1 DEAT\n2 DATE 1 JAN 1980');
    const date = getEstimatedDeathDate(facts, new GedcomDate(''), 120);
    expect(date.isOK()).toBe(true);
  });

  test('falls back to estimatedBirthDate + maxAliveAge years when no real death fact exists', () => {
    const facts = parseFacts('0 @I1@ INDI\n1 SEX M');
    const estimatedBirth = new GedcomDate('EST 1900');
    const date = getEstimatedDeathDate(facts, estimatedBirth, 120);

    expect(date.isOK()).toBe(true);
    expect(date.minimumJulianDay()).toBeGreaterThan(estimatedBirth.minimumJulianDay());
  });

  test('a blank estimated birth date -> blank death date too', () => {
    const facts = parseFacts('0 @I1@ INDI\n1 SEX M');
    const date = getEstimatedDeathDate(facts, new GedcomDate(''), 120);
    expect(date.isOK()).toBe(false);
  });
});

describe('individualRowsForSurnames', () => {
  test('queries wt_name joined to wt_individuals, NO wt_link join (fams=false)', async () => {
    const pool = mockPool([['wt_name', { rows: [{ xref: 'I1', n_givn: 'John', n_surn: 'SMITH' }] }]]);
    const rows = await individualRowsForSurnames(pool, 1, ['SMITH'], '', true);

    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toContain('wt_link');
    expect(sql).toContain('wt_individuals');
    expect(rows).toEqual([{ xref: 'I1', matchedGivn: 'John', matchedSurn: 'SMITH' }]);
  });

  test('excludes blank/unknown surnames by default when surnsToShow is empty', async () => {
    const pool = mockPool([['wt_name', { rows: [] }]]);
    await individualRowsForSurnames(pool, 1, [], '', true);
    expect(pool.query.mock.calls[0][0]).toContain("n_surn NOT IN ('', '@N.N.')");
  });

  test('filters by given-name initial in JS, not SQL - a real row can appear more than once per individual', async () => {
    const pool = mockPool([
      ['wt_name', { rows: [
        { xref: 'I1', n_givn: 'John', n_surn: 'SMITH' },
        { xref: 'I1', n_givn: 'Jack', n_surn: 'SMITH' },
        { xref: 'I2', n_givn: 'Zara', n_surn: 'SMITH' },
      ] }],
    ]);
    const rows = await individualRowsForSurnames(pool, 1, ['SMITH'], 'J', true);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.xref === 'I1')).toBe(true);
  });
});

describe('loadShowEstimatedDatesPref', () => {
  test('defaults to false when no row exists', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const { loadShowEstimatedDatesPref } = await import('../pages-server/individual-list.mjs');
    expect(await loadShowEstimatedDatesPref(pool, 1)).toBe(false);
  });

  test('true only when the stored value is exactly "1"', async () => {
    const pool = { query: async () => ({ rows: [{ setting_value: '1' }] }) };
    const { loadShowEstimatedDatesPref } = await import('../pages-server/individual-list.mjs');
    expect(await loadShowEstimatedDatesPref(pool, 1)).toBe(true);
  });
});
