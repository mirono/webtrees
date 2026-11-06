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
import * as data from '../pages-server/statistics-data.mjs';

const GEDCOM_ID = 1;

describe('statistics-data.mjs', () => {
  describe('countIndividuals', () => {
    test('returns the count of individuals', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '42' }] }),
      };

      const result = await data.countIndividuals(pool, GEDCOM_ID);

      expect(result).toBe(42);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM wt_individuals WHERE i_file = $1',
        [GEDCOM_ID]
      );
    });

    test('returns 0 when no individuals', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '0' }] }),
      };

      const result = await data.countIndividuals(pool, GEDCOM_ID);

      expect(result).toBe(0);
    });

    test('handles null counts', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: null }] }),
      };

      const result = await data.countIndividuals(pool, GEDCOM_ID);

      expect(result).toBe(0);
    });
  });

  describe('countFamilies', () => {
    test('returns the count of families', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '15' }] }),
      };

      const result = await data.countFamilies(pool, GEDCOM_ID);

      expect(result).toBe(15);
    });
  });

  describe('countIndividualsDeceased', () => {
    test('counts individuals with DEAT fact', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '30' }] }),
      };

      const result = await data.countIndividualsDeceased(pool, GEDCOM_ID);

      expect(result).toBe(30);
    });
  });

  describe('countIndividualsLiving', () => {
    test('counts individuals without DEAT fact', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '12' }] }),
      };

      const result = await data.countIndividualsLiving(pool, GEDCOM_ID);

      expect(result).toBe(12);
    });
  });

  describe('countIndividualsBySex', () => {
    test('counts males', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '20' }] }),
      };

      const result = await data.countIndividualsBySex(pool, GEDCOM_ID, 'M');

      expect(result).toBe(20);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM wt_individuals WHERE i_file = $1 AND i_sex = $2',
        [GEDCOM_ID, 'M']
      );
    });

    test('counts females', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '22' }] }),
      };

      const result = await data.countIndividualsBySex(pool, GEDCOM_ID, 'F');

      expect(result).toBe(22);
    });
  });

  describe('countIndividualsWithSources', () => {
    test('returns count of individuals with sources', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '8' }] }),
      };

      const result = await data.countIndividualsWithSources(pool, GEDCOM_ID);

      expect(result).toBe(8);
    });
  });

  describe('countFamiliesWithSources', () => {
    test('returns count of families with sources', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '3' }] }),
      };

      const result = await data.countFamiliesWithSources(pool, GEDCOM_ID);

      expect(result).toBe(3);
    });
  });

  describe('countMedia', () => {
    test('counts all media when type is null', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '25' }] }),
      };

      const result = await data.countMedia(pool, GEDCOM_ID, null);

      expect(result).toBe(25);
    });

    test('counts all media when type is "all"', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '25' }] }),
      };

      const result = await data.countMedia(pool, GEDCOM_ID, 'all');

      expect(result).toBe(25);
    });
  });

  describe('countMediaByType', () => {
    test('returns media grouped by type', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { type: 'photo', count: '15' },
            { type: 'document', count: '8' },
          ],
        }),
      };

      const result = await data.countMediaByType(pool, GEDCOM_ID);

      expect(result).toEqual([
        ['photo', 15],
        ['document', 8],
      ]);
    });
  });

  describe('countNotes', () => {
    test('returns count of notes', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '5' }] }),
      };

      const result = await data.countNotes(pool, GEDCOM_ID);

      expect(result).toBe(5);
    });
  });

  describe('countAllPlaces', () => {
    test('returns count of places', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '50' }] }),
      };

      const result = await data.countAllPlaces(pool, GEDCOM_ID);

      expect(result).toBe(50);
    });
  });

  describe('countRepositories', () => {
    test('returns count of repositories', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '2' }] }),
      };

      const result = await data.countRepositories(pool, GEDCOM_ID);

      expect(result).toBe(2);
    });
  });

  describe('countSources', () => {
    test('returns count of sources', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '40' }] }),
      };

      const result = await data.countSources(pool, GEDCOM_ID);

      expect(result).toBe(40);
    });
  });

  describe('countSurnames', () => {
    test('returns total count of distinct surnames when no names given', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '100' }] }),
      };

      const result = await data.countSurnames(pool, GEDCOM_ID, []);

      expect(result).toBe(100);
    });

    test('returns count of specific surnames', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '5' }] }),
      };

      const result = await data.countSurnames(pool, GEDCOM_ID, ['Smith', 'Jones']);

      expect(result).toBe(5);
    });
  });

  describe('countGivenNames', () => {
    test('returns total count of distinct given names when no names given', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '200' }] }),
      };

      const result = await data.countGivenNames(pool, GEDCOM_ID, []);

      expect(result).toBe(200);
    });
  });

  describe('countOtherEvents', () => {
    test('excludes specified events', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '10' }] }),
      };

      const result = await data.countOtherEvents(pool, GEDCOM_ID, ['CHAN']);

      expect(result).toBe(10);
    });
  });

  describe('countFamiliesWithNoChildren', () => {
    test('returns count of childless families', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: '5' }] }),
      };

      const result = await data.countFamiliesWithNoChildren(pool, GEDCOM_ID);

      expect(result).toBe(5);
    });
  });

  describe('averageChildrenPerFamily', () => {
    test('returns average number of children per family', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ avg: '2.5' }] }),
      };

      const result = await data.averageChildrenPerFamily(pool, GEDCOM_ID);

      expect(result).toBe(2.5);
    });

    test('handles null averages', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ avg: null }] }),
      };

      const result = await data.averageChildrenPerFamily(pool, GEDCOM_ID);

      expect(result).toBe(0);
    });
  });

  describe('averageLifespanDays', () => {
    test('calculates average lifespan for all', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ days: '25550' }] }),
      };

      const result = await data.averageLifespanDays(pool, GEDCOM_ID, 'ALL');

      expect(result).toBe(25550);
    });

    test('calculates average lifespan for females', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ days: '26000' }] }),
      };

      const result = await data.averageLifespanDays(pool, GEDCOM_ID, 'F');

      expect(result).toBe(26000);
    });

    test('calculates average lifespan for males', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ days: '25000' }] }),
      };

      const result = await data.averageLifespanDays(pool, GEDCOM_ID, 'M');

      expect(result).toBe(25000);
    });
  });

  describe('countEventsByCentury', () => {
    test('returns events grouped by century', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { century: 19, total: '50' },
            { century: 20, total: '80' },
          ],
        }),
      };

      const result = await data.countEventsByCentury(pool, GEDCOM_ID, 'BIRT');

      expect(result).toEqual([
        [19, 50],
        [20, 80],
      ]);
    });

    test('handles empty result', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const result = await data.countEventsByCentury(pool, GEDCOM_ID, 'BIRT');

      expect(result).toEqual([]);
    });
  });

  describe('firstEventRecord', () => {
    test('resolves a fact-specific match to its owning individual', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ xref: 'I1' }] }) // wt_dates
          .mockResolvedValueOnce({ rows: [{ i_gedcom: '0 @I1@ INDI' }] }), // wt_individuals
      };

      const result = await data.firstEventRecord(pool, GEDCOM_ID, ['BIRT'], true);

      expect(result).toEqual({ xref: 'I1', gedcom: '0 @I1@ INDI', isFamily: false });
    });

    test('resolves a family-level fact (regression: MARR/DIV never matched when unconditionally joined to wt_individuals) to its owning family', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ xref: 'F1' }] }) // wt_dates
          .mockResolvedValueOnce({ rows: [] }) // not an individual
          .mockResolvedValueOnce({ rows: [{ f_gedcom: '0 @F1@ FAM' }] }), // wt_families
      };

      const result = await data.firstEventRecord(pool, GEDCOM_ID, ['MARR'], true);

      expect(result).toEqual({ xref: 'F1', gedcom: '0 @F1@ FAM', isFamily: true });
    });

    test('resolves the "any event" (empty facts) case the same way', async () => {
      const pool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ xref: 'I2' }] })
          .mockResolvedValueOnce({ rows: [{ i_gedcom: '0 @I2@ INDI' }] }),
      };

      const result = await data.firstEventRecord(pool, GEDCOM_ID, [], true);

      expect(result).toEqual({ xref: 'I2', gedcom: '0 @I2@ INDI', isFamily: false });
    });

    test('returns null when no records found', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const result = await data.firstEventRecord(pool, GEDCOM_ID, ['BIRT'], true);

      expect(result).toBeNull();
    });
  });

  describe('countPlacesForIndividuals', () => {
    test('regex-scans each individual\'s GEDCOM for a PLAC sub-record of the given event and tallies them (regression: wt_dates has no place column at all)', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { i_gedcom: '0 @I1@ INDI\n1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC London, England' },
            { i_gedcom: '0 @I2@ INDI\n1 BIRT\n2 PLAC London, England' },
            { i_gedcom: '0 @I3@ INDI\n1 BIRT\n2 PLAC Paris, France' },
            { i_gedcom: '0 @I4@ INDI\n1 DEAT\n2 PLAC Berlin, Germany' }, // a different event - must not count
          ],
        }),
      };

      const result = await data.countPlacesForIndividuals(pool, GEDCOM_ID, 'BIRT', 10);

      expect(result).toEqual([
        { place: 'London, England', count: 2 },
        { place: 'Paris, France', count: 1 },
      ]);
    });

    test('respects the limit', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { i_gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC A' },
            { i_gedcom: '0 @I2@ INDI\n1 BIRT\n2 PLAC B' },
          ],
        }),
      };

      const result = await data.countPlacesForIndividuals(pool, GEDCOM_ID, 'BIRT', 1);

      expect(result).toHaveLength(1);
    });
  });

  describe('countPlacesForFamilies', () => {
    test('regex-scans each family\'s GEDCOM for a PLAC sub-record of the given event', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { f_gedcom: '0 @F1@ FAM\n1 MARR\n2 DATE 1 JAN 1900\n2 PLAC London, England' },
            { f_gedcom: '0 @F2@ FAM\n1 MARR\n2 PLAC London, England' },
          ],
        }),
      };

      const result = await data.countPlacesForFamilies(pool, GEDCOM_ID, 'MARR', 10);

      expect(result).toEqual([{ place: 'London, England', count: 2 }]);
    });
  });

  describe('commonGivenNames', () => {
    test('returns common given names', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { name: 'John', count: '10' },
            { name: 'James', count: '8' },
          ],
        }),
      };

      const result = await data.commonGivenNames(pool, GEDCOM_ID, 'ALL', 1, 10);

      expect(result).toEqual([
        { name: 'John', count: 10 },
        { name: 'James', count: 8 },
      ]);
    });
  });

  describe('commonSurnames', () => {
    test('returns common surnames', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { name: 'Smith', count: '25' },
            { name: 'Jones', count: '18' },
          ],
        }),
      };

      const result = await data.commonSurnames(pool, GEDCOM_ID, 10, 1, 'count');

      expect(result).toEqual([
        { name: 'Smith', count: 25 },
        { name: 'Jones', count: 18 },
      ]);
    });
  });

  describe('countChildren', () => {
    test('returns total number of children', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ total: '150' }] }),
      };

      const result = await data.countChildren(pool, GEDCOM_ID);

      expect(result).toBe(150);
    });
  });

  describe('statsAge', () => {
    test('returns age statistics by century and sex', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { century: 19, sex: 'M', age: '18250' },
            { century: 19, sex: 'F', age: '18250' },
          ],
        }),
      };

      const result = await data.statsAge(pool, GEDCOM_ID);

      expect(result).toEqual([
        { century: 19, sex: 'M', age: 50 },
        { century: 19, sex: 'F', age: 50 },
      ]);
    });
  });

  describe('statsMarrAgeByCentury', () => {
    test('passes exactly one bound parameter for the combined UNION ALL query (regression: previously passed two for a statement with only $1)', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await data.statsMarrAgeByCentury(pool, GEDCOM_ID);

      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [GEDCOM_ID]);
    });

    test('returns marriage-age statistics by century and sex', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { century: 19, sex: 'M', age: '25.5' },
            { century: 19, sex: 'F', age: '22.1' },
          ],
        }),
      };

      const result = await data.statsMarrAgeByCentury(pool, GEDCOM_ID);

      expect(result).toEqual([
        { century: 19, sex: 'M', age: 25.5 },
        { century: 19, sex: 'F', age: 22.1 },
      ]);
    });
  });

  describe('topTenOldestQuery', () => {
    test('returns oldest individuals', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { i_id: 'I1', i_gedcom: '0 @I1@ INDI', days: '30000' },
            { i_id: 'I2', i_gedcom: '0 @I2@ INDI', days: '28000' },
          ],
        }),
      };

      const result = await data.topTenOldestQuery(pool, GEDCOM_ID, 'ALL', 10);

      expect(result).toHaveLength(2);
      expect(result[0].days).toBe(30000);
    });
  });

  describe('countIndividualsByCountry', () => {
    test('issues WHERE after every JOIN (regression: the first attempt put WHERE before JOIN, a SQL syntax error)', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      await data.countIndividualsByCountry(pool, GEDCOM_ID);

      const sql = pool.query.mock.calls[0][0];
      const whereIndex = sql.search(/\bWHERE\b/i);
      const lastJoinIndex = sql.toUpperCase().lastIndexOf('JOIN');
      expect(whereIndex).toBeGreaterThan(lastJoinIndex);
    });

    test('resolves place names to ISO numeric codes and sums counts for places sharing a code', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { p_place: 'United Kingdom', count: '5' },
            { p_place: 'England', count: '3' }, // a UK constituent country - also code 826
            { p_place: 'Atlantis', count: '2' }, // not a real country - dropped
          ],
        }),
      };

      const result = await data.countIndividualsByCountry(pool, GEDCOM_ID);

      expect(result).toEqual([{ numericCode: 826, count: 8 }]);
    });
  });

  describe('countIndividualEventsByCountry', () => {
    test('only counts a place toward the given fact when its own PLAC sub-record names that country (regression: the first attempt ignored the fact parameter and counted every place against every fact)', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { p_place: 'France', i_gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC Paris, France\n1 DEAT\n2 PLAC Berlin, Germany' },
          ],
        }),
      };

      const birthResult = await data.countIndividualEventsByCountry(pool, GEDCOM_ID, 'BIRT');
      expect(birthResult).toEqual([{ numericCode: 250, count: 1 }]);

      const deathResult = await data.countIndividualEventsByCountry(pool, GEDCOM_ID, 'DEAT');
      expect(deathResult).toEqual([]); // the DEAT PLAC says Germany, not France - France's row must not count
    });
  });

  describe('countryNameForNumericCode', () => {
    test('maps a numeric code back to its English display name', () => {
      expect(data.countryNameForNumericCode(840)).toBe('United States');
    });

    test('returns the placeholder for an unknown code', () => {
      expect(data.countryNameForNumericCode(999999)).toBe('???');
    });
  });
});
