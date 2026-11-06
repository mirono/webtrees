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
import { individualRecordHtml, familyRecordHtml } from '../pages-server/statistics-records.mjs';

const TREE = { gedcomId: 1, name: 'ophir' };
const TREE_PRIVACY_PREFS = {
  hideLivePeople: true,
  showDeadPeople: 2,
  maxAliveAge: 120,
  keepAliveYearsBirth: 0,
  keepAliveYearsDeath: 0,
  showLivingNames: 0,
};
const NO_SELF_RECORD = { gedcomid: null, pathLength: 0 };

function mockPool({ individuals = {}, families = {} } = {}) {
  return {
    query: vi.fn((sql, params) => {
      if (sql.includes('FROM wt_default_resn')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('FROM wt_individuals')) {
        const xref = params[0];
        const gedcom = individuals[xref];
        return Promise.resolve({ rows: gedcom ? [{ i_id: xref, i_gedcom: gedcom }] : [] });
      }
      if (sql.includes('FROM wt_families')) {
        const xref = params[0];
        const row = families[xref];
        return Promise.resolve({ rows: row ? [row] : [] });
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}

describe('individualRecordHtml', () => {
  test('a null record returns the "not available" fallback', async () => {
    const pool = mockPool();
    expect(await individualRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 2, NO_SELF_RECORD, null)).toBe(
      'This information is not available.',
    );
  });

  test('a showable individual renders a link with their name', async () => {
    const pool = mockPool();
    const gedcom = '0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900';
    const html = await individualRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 1, NO_SELF_RECORD, { xref: 'I1', gedcom });
    expect(html).toContain('<a href="/tree/ophir/individual/I1">');
    expect(html).toContain('John');
  });

  test('a privacy-restricted individual renders "Private" with no link', async () => {
    const pool = mockPool();
    const gedcom = '0 @I2@ INDI\n1 NAME Jane /Doe/\n1 SEX F\n1 RESN confidential';
    const html = await individualRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 1, NO_SELF_RECORD, { xref: 'I2', gedcom });
    expect(html).not.toContain('<a href');
    expect(html).toContain('Private');
  });
});

describe('familyRecordHtml', () => {
  test('a null record returns the "not available" fallback', async () => {
    const pool = mockPool();
    expect(await familyRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 2, NO_SELF_RECORD, null)).toBe(
      'This information is not available.',
    );
  });

  test('a showable family renders a link with husband + wife names', async () => {
    const pool = mockPool({
      individuals: {
        I1: '0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M',
        I2: '0 @I2@ INDI\n1 NAME Jane /Doe/\n1 SEX F',
      },
      families: { F1: { f_id: 'F1', f_gedcom: '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@', f_husb: 'I1', f_wife: 'I2' } },
    });
    const html = await familyRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 1, NO_SELF_RECORD, { xref: 'F1', gedcom: '' });
    expect(html).toContain('<a href="/tree/ophir/family/F1">');
    expect(html).toContain('John');
    expect(html).toContain('Jane');
    expect(html).toContain(' + ');
  });

  test('a family with a privacy-restricted spouse still shows the other name', async () => {
    const pool = mockPool({
      individuals: {
        I1: '0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n1 RESN confidential',
        I2: '0 @I2@ INDI\n1 NAME Jane /Doe/\n1 SEX F',
      },
      families: { F1: { f_id: 'F1', f_gedcom: '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@', f_husb: 'I1', f_wife: 'I2' } },
    });
    const html = await familyRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 1, NO_SELF_RECORD, { xref: 'F1', gedcom: '' });
    expect(html).toContain('Private');
    expect(html).toContain('Jane');
  });

  test('a family with no family record at all falls back to "not available"', async () => {
    const pool = mockPool();
    expect(await familyRecordHtml(pool, TREE, TREE_PRIVACY_PREFS, 2, NO_SELF_RECORD, { xref: 'F9', gedcom: '' })).toBe(
      'This information is not available.',
    );
  });
});
